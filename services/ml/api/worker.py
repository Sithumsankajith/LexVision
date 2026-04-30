import base64
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from sqlalchemy.orm import Session

from .database import SessionLocal
from .constants import ReportStatusEnum, StatusChangeSourceEnum, StatusEnum
from .models import AuditLog, Evidence, EvidenceFile, EvidenceReport, InferenceLog, Report
from .tracking import apply_evidence_report_status

# Configure logging once for the background worker entrypoint.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "temp" / "anpr_crops"
HELMET_MODEL_PATH = Path(os.getenv("HELMET_MODEL_PATH", str(MODELS_DIR / "helmet_best.pt")))
ANPR_MODEL_PATH = Path(os.getenv("ANPR_MODEL_PATH", str(MODELS_DIR / "anpr_best.pt")))
PLATE_CLASS_NAME = "License_Plate"
HELMET_MODEL_VERSION = HELMET_MODEL_PATH.name
ANPR_MODEL_VERSION = f"{ANPR_MODEL_PATH.name}|easyocr"
QUALITY_THRESHOLD = 0.15
HIGH_CONFIDENCE_THRESHOLD = 0.8
MEDIUM_CONFIDENCE_THRESHOLD = 0.5

_helmet_detector = None
_helmet_detector_load_attempted = False
_plate_detector = None
_plate_detector_load_attempted = False
_ocr_reader = None
_ocr_reader_load_attempted = False

VIOLATION_LABEL_ALIASES = {
    "helmet": "helmet",
    "nohelmet": "no-helmet",
    "no-helmet": "no-helmet",
    "notwearinghelmet": "no-helmet",
    "not_wearing_helmet": "no-helmet",
    "not wearing helmet": "no-helmet",
    "not wearing helment": "no-helmet",
    "redlight": "red-light",
    "red-light": "red-light",
    "red-light-violation": "red-light",
    "whiteline": "white-line",
    "white-line": "white-line",
    "white-line-crossing": "white-line",
}

# A permissive matcher for common Sri Lankan private-vehicle layouts once OCR
# noise has been normalized. This accepts compact forms like ABC1234 and
# province-prefixed variants like WPABC1234.
SRI_LANKAN_PLATE_REGEX = re.compile(r"^(?P<prefix>[A-Z]{2,5})(?P<number>\d{4})$")

LETTER_TO_DIGIT_MAP = str.maketrans(
    {
        "O": "0",
        "Q": "0",
        "D": "0",
        "I": "1",
        "L": "1",
        "Z": "2",
        "S": "5",
        "B": "8",
        "G": "6",
    }
)
DIGIT_TO_LETTER_MAP = str.maketrans(
    {
        "0": "O",
        "1": "I",
        "2": "Z",
        "5": "S",
        "6": "G",
        "8": "B",
    }
)


def _relative_to_base(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return str(path.resolve().relative_to(BASE_DIR.resolve()))
    except ValueError:
        return str(path.resolve())


def _confidence_band(score: float) -> str:
    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def _normalize_violation_label(label: str | None) -> str | None:
    if not label:
        return None

    normalized_key = re.sub(r"[^a-z0-9]+", "", label.strip().lower())
    if not normalized_key:
        return None
    return VIOLATION_LABEL_ALIASES.get(normalized_key)


def _infer_violation_type_from_ai(detected_classes: list[str]) -> str | None:
    """
    Infer a violation type only from model outputs.

    The current worker runs a dedicated ANPR detector, so most runs will only
    produce license-plate classes and return None here. That is intentional: we
    no longer copy the citizen's claim into the AI-inferred field.
    """
    for detected_class in detected_classes:
        inferred_label = _normalize_violation_label(detected_class)
        if inferred_label:
            return inferred_label
    return None


def _get_helmet_detector():
    """Load the helmet detector once and keep a safe fallback if missing."""
    global _helmet_detector, _helmet_detector_load_attempted

    if _helmet_detector is not None:
        return _helmet_detector
    if _helmet_detector_load_attempted:
        return None

    _helmet_detector_load_attempted = True
    if not HELMET_MODEL_PATH.exists():
        logger.warning("Helmet model not found at %s. Violation inference will fall back to manual review.", HELMET_MODEL_PATH)
        return None

    from ultralytics import YOLO

    logger.info("Loading helmet detector from %s", HELMET_MODEL_PATH)
    _helmet_detector = YOLO(str(HELMET_MODEL_PATH))
    logger.info("Helmet detector ready.")
    return _helmet_detector


def _get_plate_detector():
    """Load the dedicated ANPR detector once and keep a safe fallback if missing."""
    global _plate_detector, _plate_detector_load_attempted

    if _plate_detector is not None:
        return _plate_detector
    if _plate_detector_load_attempted:
        return None

    _plate_detector_load_attempted = True
    if not ANPR_MODEL_PATH.exists():
        logger.warning("ANPR model not found at %s. Plate detection will fall back to manual review.", ANPR_MODEL_PATH)
        return None

    from ultralytics import YOLO

    logger.info("Loading ANPR plate detector from %s", ANPR_MODEL_PATH)
    _plate_detector = YOLO(str(ANPR_MODEL_PATH))
    logger.info("ANPR plate detector ready.")
    return _plate_detector


def _get_ocr_reader():
    """Lazy-load EasyOCR and keep the worker operational if it is unavailable."""
    global _ocr_reader, _ocr_reader_load_attempted

    if _ocr_reader is not None:
        return _ocr_reader
    if _ocr_reader_load_attempted:
        return None

    _ocr_reader_load_attempted = True
    try:
        import easyocr
    except ImportError:
        logger.warning("EasyOCR is not installed. OCR will be skipped and reports will remain under manual review.")
        return None

    logger.info("Initializing EasyOCR reader for ANPR...")
    _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    logger.info("EasyOCR reader ready.")
    return _ocr_reader


def _decode_evidence_image_url(url: str | None) -> str | None:
    """Decode a base64 evidence URL to a temporary image file and return its path."""
    if not url:
        return None

    try:
        if url.startswith("data:image"):
            header, b64data = url.split(",", 1)
            img_bytes = base64.b64decode(b64data)
            ext = ".png" if "png" in header else ".jpg"

            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            tmp.write(img_bytes)
            tmp.close()
            return tmp.name

        if os.path.exists(url):
            return url

        logger.warning("Evidence URL is not a base64 data URI or file path: %s...", url[:50])
        return None
    except Exception as exc:
        logger.error("Failed to decode evidence image: %s", exc)
        return None


def _is_image_media(media_type: str | None, mime_type: str | None, url: str | None) -> bool:
    if mime_type and mime_type.startswith("image/"):
        return True
    if media_type == "image":
        return True
    if url and url.startswith("data:image"):
        return True
    return False


def _select_primary_evidence_image(
    db: Session,
    report_id: str,
    report_kind: Literal["legacy", "evidence"],
) -> str | None:
    if report_kind == "evidence":
        evidence_items = (
            db.query(EvidenceFile)
            .filter(EvidenceFile.report_id == report_id)
            .order_by(EvidenceFile.created_at.asc())
            .all()
        )
        for evidence_item in evidence_items:
            if _is_image_media(evidence_item.file_type, evidence_item.mime_type, evidence_item.storage_url):
                image_path = _decode_evidence_image_url(evidence_item.storage_url)
                if image_path:
                    return image_path
        return None

    evidence_items = (
        db.query(Evidence)
        .filter(Evidence.report_id == report_id)
        .order_by(Evidence.created_at.asc())
        .all()
    )
    for evidence_item in evidence_items:
        if _is_image_media(evidence_item.type, None, evidence_item.url):
            image_path = _decode_evidence_image_url(evidence_item.url)
            if image_path:
                return image_path
    return None


def _empty_plate_detection(status: str) -> dict:
    return {
        "detections": [],
        "detected_classes": [],
        "best_detection": None,
        "max_confidence": 0.0,
        "num_detections": 0,
        "status": status,
    }


def _empty_violation_detection(status: str) -> dict:
    return {
        "detections": [],
        "detected_classes": [],
        "inferred_violation_type": None,
        "max_confidence": 0.0,
        "status": status,
    }


def _run_violation_detection(image_path: str) -> dict:
    """
    Detect the violation class from the dedicated helmet detector.
    The best normalized violation label is returned for police review.
    """
    model = _get_helmet_detector()
    if model is None:
        return _empty_violation_detection("model_unavailable")

    try:
        results = model.predict(source=image_path, verbose=False, device="cpu")
    except Exception as exc:
        logger.error("Violation detection failed for %s: %s", image_path, exc)
        return _empty_violation_detection("detection_error")

    detections: list[dict] = []
    candidate_detections: list[dict] = []
    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue

        for box in boxes:
            cls_id = int(box.cls[0]) if getattr(box, "cls", None) is not None else 0
            if isinstance(result.names, dict):
                cls_name = result.names.get(cls_id, "unknown")
            elif isinstance(result.names, list) and 0 <= cls_id < len(result.names):
                cls_name = result.names[cls_id]
            else:
                cls_name = "unknown"

            normalized_label = _normalize_violation_label(cls_name)
            confidence = round(float(box.conf[0]), 4)
            xyxy = box.xyxy[0].tolist()
            detection = {
                "class": cls_name,
                "normalized_class": normalized_label,
                "confidence": confidence,
                "bbox": {
                    "x1": round(xyxy[0], 1),
                    "y1": round(xyxy[1], 1),
                    "x2": round(xyxy[2], 1),
                    "y2": round(xyxy[3], 1),
                },
            }
            detections.append(detection)
            if normalized_label:
                candidate_detections.append(detection)

    if not detections:
        return _empty_violation_detection("no_detection")

    if not candidate_detections:
        return {
            "detections": detections,
            "detected_classes": sorted({item["class"] for item in detections}),
            "inferred_violation_type": None,
            "max_confidence": 0.0,
            "status": "no_supported_violation_class",
        }

    best_detection = max(candidate_detections, key=lambda item: item["confidence"])
    return {
        "detections": detections,
        "detected_classes": sorted({item["class"] for item in detections}),
        "inferred_violation_type": best_detection["normalized_class"],
        "max_confidence": best_detection["confidence"],
        "status": "success",
    }


def _run_plate_detection(image_path: str) -> dict:
    """
    Detect license plates using the dedicated YOLO model and return every box,
    plus the highest-confidence detection for downstream cropping.
    """
    model = _get_plate_detector()
    if model is None:
        return _empty_plate_detection("model_unavailable")

    try:
        results = model.predict(source=image_path, verbose=False, device="cpu")
    except Exception as exc:
        logger.error("Plate detection failed for %s: %s", image_path, exc)
        return _empty_plate_detection("detection_error")

    detections: list[dict] = []
    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue

        for box in boxes:
            cls_id = int(box.cls[0]) if getattr(box, "cls", None) is not None else 0
            if isinstance(result.names, dict):
                cls_name = result.names.get(cls_id, PLATE_CLASS_NAME)
            elif isinstance(result.names, list) and 0 <= cls_id < len(result.names):
                cls_name = result.names[cls_id]
            else:
                cls_name = PLATE_CLASS_NAME
            conf = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()
            detections.append(
                {
                    "class": cls_name,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x1": round(xyxy[0], 1),
                        "y1": round(xyxy[1], 1),
                        "x2": round(xyxy[2], 1),
                        "y2": round(xyxy[3], 1),
                    },
                }
            )

    if not detections:
        return _empty_plate_detection("no_plate_detected")

    best_detection = max(detections, key=lambda item: item["confidence"])
    return {
        "detections": detections,
        "detected_classes": sorted({item["class"] for item in detections}),
        "best_detection": best_detection,
        "max_confidence": best_detection["confidence"],
        "num_detections": len(detections),
        "status": "success",
    }


def _crop_highest_confidence_plate(
    image_path: str, detection: dict, report_id: str
) -> tuple[np.ndarray | None, str | None]:
    """Crop the best plate region and persist it for later debugging/review."""
    if not detection:
        return None, None

    image = cv2.imread(image_path)
    if image is None:
        logger.error("Could not load evidence image for cropping: %s", image_path)
        return None, None

    bbox = detection["bbox"]
    height, width = image.shape[:2]
    x1 = max(0, int(bbox["x1"]) - 4)
    y1 = max(0, int(bbox["y1"]) - 4)
    x2 = min(width, int(bbox["x2"]) + 4)
    y2 = min(height, int(bbox["y2"]) + 4)

    if x2 <= x1 or y2 <= y1:
        logger.warning("Detected plate bbox is invalid for report %s: %s", report_id, bbox)
        return None, None

    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        logger.warning("Plate crop is empty for report %s", report_id)
        return None, None

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    crop_path = TEMP_DIR / f"{report_id}_{int(time.time() * 1000)}.png"
    if not cv2.imwrite(str(crop_path), crop):
        logger.warning("Failed to persist plate crop for report %s", report_id)
        return crop, None
    return crop, _relative_to_base(crop_path)


def _preprocess_plate_crop(crop):
    """
    Enhance a detected plate crop before OCR.
    Steps: grayscale -> resize -> denoise -> adaptive threshold -> sharpening.
    """
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop

    target_width = max(320, gray.shape[1] * 2)
    scale = target_width / max(gray.shape[1], 1)
    resized = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    denoised = cv2.fastNlMeansDenoising(resized, None, 15, 7, 21)
    thresholded = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(thresholded, -1, sharpen_kernel)
    return sharpened


def _normalize_sri_lankan_plate(raw_text: str | None) -> tuple[str | None, str]:
    """Normalize OCR output into a compact Sri Lankan plate candidate."""
    if not raw_text:
        return None, "no_text_detected"

    compact = re.sub(r"[^A-Z0-9]", "", raw_text.upper())
    if not compact:
        return None, "no_text_detected"

    if len(compact) < 6:
        return compact, "invalid_sri_lankan_format"

    prefix = compact[:-4].translate(DIGIT_TO_LETTER_MAP)
    suffix = compact[-4:].translate(LETTER_TO_DIGIT_MAP)
    candidate = f"{prefix}{suffix}"

    match = SRI_LANKAN_PLATE_REGEX.match(candidate)
    if not match:
        return candidate, "invalid_sri_lankan_format"

    normalized = f"{match.group('prefix')}-{match.group('number')}"
    if normalized.replace("-", "") == compact:
        return normalized, "valid_sri_lankan_format"
    return normalized, "normalized_sri_lankan_format"


def _empty_ocr_result(status: str) -> dict:
    return {
        "plate_text": None,
        "plate_confidence": 0.0,
        "validation_status": status,
        "raw_text": None,
        "ocr_candidates": [],
    }


def _run_plate_ocr(crop) -> dict:
    """Run OCR only on a cropped plate region after dedicated preprocessing."""
    reader = _get_ocr_reader()
    if reader is None:
        return _empty_ocr_result("ocr_unavailable")

    try:
        processed = _preprocess_plate_crop(crop)
        results = reader.readtext(processed, detail=1, paragraph=False)
    except Exception as exc:
        logger.error("Plate OCR failed: %s", exc)
        return _empty_ocr_result("ocr_error")

    candidates = []
    for _, text, confidence in results:
        normalized_text, validation_status = _normalize_sri_lankan_plate(text)
        candidates.append(
            {
                "raw_text": text.strip().upper(),
                "plate_text": normalized_text,
                "confidence": round(float(confidence), 4),
                "validation_status": validation_status,
            }
        )

    if not candidates:
        return _empty_ocr_result("no_text_detected")

    def _candidate_rank(candidate: dict) -> tuple[int, float]:
        is_valid = candidate["validation_status"] in {"valid_sri_lankan_format", "normalized_sri_lankan_format"}
        return (1 if is_valid else 0, candidate["confidence"])

    best_candidate = max(candidates, key=_candidate_rank)
    return {
        "plate_text": best_candidate["plate_text"],
        "plate_confidence": best_candidate["confidence"],
        "validation_status": best_candidate["validation_status"],
        "raw_text": best_candidate["raw_text"],
        "ocr_candidates": candidates,
    }


def _build_anpr_result(report_id: str, image_path: str | None) -> dict:
    """
    Execute the full ANPR flow:
    detect plate -> crop best region -> preprocess -> OCR -> normalize/validate.
    """
    result = {
        "plate_text": None,
        "plate_confidence": 0.0,
        "bbox": None,
        "crop_path": None,
        "validation_status": "no_image",
        "detections": [],
        "detected_classes": [],
        "num_detections": 0,
        "detection_confidence": 0.0,
        "raw_text": None,
        "ocr_candidates": [],
    }

    if not image_path:
        return result

    detection_result = _run_plate_detection(image_path)
    result.update(
        {
            "detections": detection_result["detections"],
            "detected_classes": detection_result["detected_classes"],
            "num_detections": detection_result["num_detections"],
            "detection_confidence": detection_result["max_confidence"],
            "validation_status": detection_result["status"],
        }
    )

    best_detection = detection_result["best_detection"]
    if best_detection is None:
        logger.info("No plate detected for report %s. Forwarding for manual review.", report_id)
        return result

    result["bbox"] = best_detection["bbox"]
    crop, crop_path = _crop_highest_confidence_plate(image_path, best_detection, report_id)
    result["crop_path"] = crop_path
    if crop is None:
        result["validation_status"] = "crop_failed"
        return result

    ocr_result = _run_plate_ocr(crop)
    result.update(
        {
            "plate_text": ocr_result["plate_text"],
            "plate_confidence": ocr_result["plate_confidence"],
            "validation_status": ocr_result["validation_status"],
            "raw_text": ocr_result["raw_text"],
            "ocr_candidates": ocr_result["ocr_candidates"],
        }
    )
    return result


def _cleanup_temporary_evidence(image_path: str | None) -> None:
    if image_path and image_path.startswith(tempfile.gettempdir()):
        try:
            os.unlink(image_path)
        except OSError:
            logger.warning("Failed to remove temporary evidence file: %s", image_path)


def attempt_inference(
    report: Report | EvidenceReport,
    db: Session,
    report_kind: Literal["legacy", "evidence"] = "legacy",
    attempt: int = 1,
):
    """Run helmet + ANPR inference on a report and keep it available for police review."""
    logger.info("Starting inference job for %s report %s (Attempt %s)", report_kind, report.id, attempt)
    start_time = time.time()
    processed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    if report_kind == "legacy" and report.claimed_violation_type is None and report.violation_type is not None:
        # Legacy rows may still have only violation_type populated from before
        # the claimed/inferred/final split. Keep the citizen claim accessible.
        report.claimed_violation_type = report.violation_type

    claimed_violation_type = report.claimed_violation_type if report_kind == "legacy" else report.violation_type

    if report.status == StatusEnum.SUBMITTED:
        if report_kind == "evidence":
            apply_evidence_report_status(
                report,
                ReportStatusEnum.AI_PROCESSING,
                notes="AI inference started for citizen evidence report.",
                source=StatusChangeSourceEnum.ML_WORKER,
                changed_by_citizen_id=report.citizen_id,
            )
        else:
            report.status = StatusEnum.AI_PROCESSING
        db.commit()

    image_path = _select_primary_evidence_image(db, report.id, report_kind)
    violation_result = _run_violation_detection(image_path) if image_path else _empty_violation_detection("no_image")
    anpr_result = _build_anpr_result(report.id, image_path)

    _cleanup_temporary_evidence(image_path)

    bbox_clarity = 1.0 if anpr_result["bbox"] else 0.0
    quality_score = (
        violation_result["max_confidence"] * 0.55
        + anpr_result["detection_confidence"] * 0.2
        + anpr_result["plate_confidence"] * 0.2
        + bbox_clarity * 0.05
    )
    overall_confidence = round(quality_score, 4)
    confidence_band = _confidence_band(overall_confidence)
    latency = time.time() - start_time
    inferred_violation_type = violation_result["inferred_violation_type"]
    if report_kind == "legacy":
        report.inferred_violation_type = inferred_violation_type
    elif not report.vehicle_plate and anpr_result["plate_text"]:
        report.vehicle_plate = anpr_result["plate_text"]

    bbox_payload = {
        "model_version": {
            "helmet": HELMET_MODEL_VERSION,
            "anpr": ANPR_MODEL_VERSION,
        },
        "processing_timestamp": processed_at.isoformat(),
        "violation_detections": violation_result["detections"],
        "violation_detection_status": violation_result["status"],
        "violation_confidence": violation_result["max_confidence"],
        "detections": anpr_result["detections"],
        "detected_classes": anpr_result["detected_classes"],
        "quality_score": overall_confidence,
        "confidence_band": confidence_band,
        "claimed_violation_type": claimed_violation_type,
        "inferred_violation_type": inferred_violation_type,
        "bbox": anpr_result["bbox"],
        "crop_path": anpr_result["crop_path"],
        "plate_text": anpr_result["plate_text"],
        "plate_confidence": round(anpr_result["plate_confidence"], 4),
        "validation_status": anpr_result["validation_status"],
        "ocr_output": {
            "raw_text": anpr_result["raw_text"],
            "plate_text": anpr_result["plate_text"],
            "plate_confidence": round(anpr_result["plate_confidence"], 4),
            "candidates": anpr_result["ocr_candidates"],
        },
    }

    inference_log_filter = (
        InferenceLog.evidence_report_id == report.id
        if report_kind == "evidence"
        else InferenceLog.report_id == report.id
    )
    inference_log = db.query(InferenceLog).filter(inference_log_filter).first()
    if inference_log is None:
        inference_log = (
            InferenceLog(evidence_report_id=report.id)
            if report_kind == "evidence"
            else InferenceLog(report_id=report.id)
        )
        db.add(inference_log)

    inference_log.model_version = f"{HELMET_MODEL_VERSION}|{ANPR_MODEL_VERSION}"
    inference_log.bbox_coordinates = bbox_payload
    inference_log.confidence = overall_confidence
    inference_log.ocr_text = anpr_result["plate_text"]
    inference_log.ocr_confidence = round(anpr_result["plate_confidence"], 4)
    inference_log.inference_latency = round(latency, 4)
    inference_log.timestamp = processed_at

    # Safe fallback: if the worker cannot extract a usable plate candidate, keep
    # the report available for manual review instead of hard-rejecting it.
    if not image_path:
        if report_kind == "evidence":
            apply_evidence_report_status(
                report,
                ReportStatusEnum.REJECTED,
                notes="AI worker could not find a usable evidence image.",
                source=StatusChangeSourceEnum.ML_WORKER,
                changed_by_citizen_id=report.citizen_id,
            )
        else:
            report.status = StatusEnum.REJECTED
        inference_log.bbox_coordinates["filtering"] = "Rejected: no usable evidence image found."
    else:
        if report_kind == "evidence":
            apply_evidence_report_status(
                report,
                ReportStatusEnum.UNDER_REVIEW,
                notes="AI inference completed and forwarded for police review.",
                source=StatusChangeSourceEnum.ML_WORKER,
                changed_by_citizen_id=report.citizen_id,
            )
        else:
            report.status = StatusEnum.UNDER_REVIEW
        if anpr_result["bbox"] is None:
            inference_log.bbox_coordinates["filtering"] = "No plate detected; forwarded to manual review."
        elif not anpr_result["plate_text"]:
            inference_log.bbox_coordinates["filtering"] = "Plate detected but OCR/validation failed; forwarded to manual review."
        elif inferred_violation_type is None and violation_result["status"] != "success":
            inference_log.bbox_coordinates["filtering"] = "Helmet model did not return a supported violation class; forwarded to manual review."
        elif quality_score < QUALITY_THRESHOLD:
            inference_log.bbox_coordinates["filtering"] = "Low-confidence plate read; forwarded to manual review."
        elif inferred_violation_type is None:
            inference_log.bbox_coordinates["filtering"] = "ANPR completed, but the current AI pipeline did not infer a violation class."

    audit = AuditLog(
        user_id=report.user_id if report_kind == "legacy" else None,
        action="INFERENCE_COMPLETION",
        target_type="InferenceLog",
        target_id=inference_log.id,
        details={
            "latency_seconds": round(latency, 4),
            "quality_score": overall_confidence,
            "confidence_band": confidence_band,
            "report_kind": report_kind,
            "plate_detections": anpr_result["num_detections"],
            "ocr_text": anpr_result["plate_text"],
            "validation_status": anpr_result["validation_status"],
            "claimed_violation_type": claimed_violation_type,
            "inferred_violation_type": inferred_violation_type,
            "violation_detection_status": violation_result["status"],
            "violation_confidence": violation_result["max_confidence"],
            "threshold_met": quality_score >= QUALITY_THRESHOLD,
            "attempt": attempt,
        },
    )
    db.add(audit)
    db.commit()

    logger.info(
        "Inference complete for %s/%s | claimed=%s | inferred=%s | plate_text=%s | confidence=%.4f (%s) | validation=%s | report_status=%s",
        report_kind,
        report.id,
        claimed_violation_type or "N/A",
        inferred_violation_type or "N/A",
        anpr_result["plate_text"] or "N/A",
        overall_confidence,
        confidence_band,
        anpr_result["validation_status"],
        report.status,
    )


def run_inference(report_id: str, report_kind: Literal["legacy", "evidence"] = "legacy", max_retries: int = 2):
    """Entry point for background inference task."""
    db: Session = SessionLocal()
    try:
        report_model = EvidenceReport if report_kind == "evidence" else Report
        report = db.query(report_model).filter(report_model.id == report_id).first()
        if not report:
            logger.error("%s report %s not found.", report_kind, report_id)
            return

        for attempt in range(1, max_retries + 1):
            try:
                attempt_inference(report, db, report_kind, attempt)
                break
            except Exception as exc:
                logger.warning("Inference attempt %s failed for %s/%s: %s", attempt, report_kind, report_id, exc)
                db.rollback()
                if attempt == max_retries:
                    logger.error("Max retries reached for %s/%s. Marking as REJECTED.", report_kind, report_id)
                    if report_kind == "evidence":
                        apply_evidence_report_status(
                            report,
                            ReportStatusEnum.REJECTED,
                            notes="AI inference failed after maximum retries.",
                            source=StatusChangeSourceEnum.ML_WORKER,
                            changed_by_citizen_id=report.citizen_id,
                        )
                    else:
                        report.status = StatusEnum.REJECTED
                    db.commit()
                    raise
                time.sleep(2)
    finally:
        db.close()

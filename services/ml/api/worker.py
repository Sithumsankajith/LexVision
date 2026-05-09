import base64
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
from sqlalchemy.orm import Session

from .database import SessionLocal
from .env import get_env_value, load_service_env
from .constants import ReportStatusEnum, StatusChangeSourceEnum, StatusEnum
from .models import AuditLog, Evidence, EvidenceFile, EvidenceReport, InferenceLog, Report
from .tracking import apply_evidence_report_status

load_service_env()

try:
    from services.ml.inference.helmet_roboflow import (
        ROBOFLOW_HELMET_MODEL_ID,
        run_helmet_detection,
    )
    from services.ml.inference.red_light_roboflow import (
        ROBOFLOW_RED_LIGHT_MODEL_ID,
        run_red_light_detection,
    )
    from services.ml.inference.white_line_roboflow import (
        ROBOFLOW_WHITE_LINE_MODEL_ID,
        run_white_line_detection,
    )
    from services.ml.inference.anpr_pipeline import run_anpr_pipeline
except ModuleNotFoundError as exc:
    if exc.name not in {
        "services",
        "services.ml",
        "services.ml.inference",
        "services.ml.inference.helmet_roboflow",
        "services.ml.inference.red_light_roboflow",
        "services.ml.inference.white_line_roboflow",
        "services.ml.inference.anpr_pipeline",
    }:
        raise
    from inference.helmet_roboflow import ROBOFLOW_HELMET_MODEL_ID, run_helmet_detection
    from inference.red_light_roboflow import ROBOFLOW_RED_LIGHT_MODEL_ID, run_red_light_detection
    from inference.white_line_roboflow import ROBOFLOW_WHITE_LINE_MODEL_ID, run_white_line_detection
    from inference.anpr_pipeline import run_anpr_pipeline

from .violation_types import normalize_claimed_violation_type
from .services.notifications import notify_citizen, notify_police, notify_admins

# Configure logging once for the background worker entrypoint.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "temp" / "anpr_crops"


def _env_path_or_default(env_var_name: str, default_path: Path) -> Path:
    raw_value = get_env_value(env_var_name)
    if raw_value is None:
        return default_path

    cleaned_value = raw_value.strip()
    if not cleaned_value:
        return default_path

    configured_path = Path(cleaned_value).expanduser()
    if configured_path.is_absolute():
        return configured_path
    candidates = [
        (Path.cwd() / configured_path).resolve(),
        (BASE_DIR / configured_path).resolve(),
        (BASE_DIR.parents[1] / configured_path).resolve(),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    if configured_path.parts[:2] == ("services", "ml"):
        return (BASE_DIR.parents[1] / configured_path).resolve()
    return (BASE_DIR / configured_path).resolve()


HELMET_MODEL_PATH = _env_path_or_default("HELMET_MODEL_PATH", MODELS_DIR / "helmet_best.pt")
ANPR_MODEL_PATH = _env_path_or_default("ANPR_MODEL_PATH", MODELS_DIR / "anpr_best.pt")
PLATE_CLASS_NAME = "License_Plate"
HELMET_MODEL_VERSION = HELMET_MODEL_PATH.name
ANPR_MODEL_VERSION = f"{ANPR_MODEL_PATH.name}|easyocr"
QUALITY_THRESHOLD = 0.15
HIGH_CONFIDENCE_THRESHOLD = 0.8
MEDIUM_CONFIDENCE_THRESHOLD = 0.5
HELMET_VIOLATION_THRESHOLD = float(get_env_value("HELMET_VIOLATION_THRESHOLD", "0.65") or "0.65")
PLATE_DETECT_CONFIDENCE = float(get_env_value("ANPR_DETECT_CONFIDENCE", "0.15") or "0.15")
PLATE_CLASS_HINTS = ("plate", "license", "licence", "number")

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
        "has_helmet_violation": False,
        "inferred_violation_type": None,
        "max_confidence": 0.0,
        "confidence_level": "none",
        "status": status,
        "provider": "helmet_inference",
        "model_version": HELMET_MODEL_VERSION,
        "error": None,
        "needs_manual_review": True,
        "review_reason": "No helmet-related object was detected. Officer must review manually." if status == "no_detection" else "AI inference failed. Officer must rely on original evidence.",
        "possible_false_positive": False,
    }


def _xyxy_to_center_bbox(xyxy: list[float]) -> dict[str, float]:
    x1, y1, x2, y2 = xyxy
    width = max(0.0, x2 - x1)
    height = max(0.0, y2 - y1)
    return {
        "x": round(x1 + (width / 2), 1),
        "y": round(y1 + (height / 2), 1),
        "width": round(width, 1),
        "height": round(height, 1),
    }


def _center_bbox_to_xyxy(bbox: dict[str, Any]) -> dict[str, float]:
    x = float(bbox.get("x") or 0.0)
    y = float(bbox.get("y") or 0.0)
    width = max(0.0, float(bbox.get("width") or 0.0))
    height = max(0.0, float(bbox.get("height") or 0.0))
    half_width = width / 2
    half_height = height / 2
    return {
        "x1": round(x - half_width, 1),
        "y1": round(y - half_height, 1),
        "x2": round(x + half_width, 1),
        "y2": round(y + half_height, 1),
    }


def _summarize_violation_detections(
    detections: list[dict[str, Any]],
    *,
    provider: str,
    model_version: str,
    status_on_empty: str = "no_detection",
    error: str | None = None,
) -> dict:
    if not detections:
        empty_result = _empty_violation_detection(status_on_empty)
        empty_result.update(
            {
                "provider": provider,
                "model_version": model_version,
                "error": error,
            }
        )
        return empty_result

    candidate_detections = [item for item in detections if item.get("normalized_class") == "no-helmet"]
    has_helmet_violation = bool(candidate_detections)
    max_confidence = max((float(item["confidence"]) for item in candidate_detections), default=0.0)
    
    inferred_violation_type = None
    manual_review_required = False
    possible_false_positive = False

    detected_normalized = {item.get("normalized_class") for item in detections if item.get("normalized_class")}

    review_reason = None
    if "no-helmet" in detected_normalized:
        if max_confidence >= HELMET_VIOLATION_THRESHOLD:
            inferred_violation_type = "NO_HELMET"
            has_helmet_violation = True
        else:
            manual_review_required = True
            review_reason = "Low confidence no-helmet detection. Officer verification is required."

        if max_confidence < 0.80:
            possible_false_positive = True
    elif "helmet" in detected_normalized and "no-helmet" not in detected_normalized:
        inferred_violation_type = None
        has_helmet_violation = False
        manual_review_required = True
        possible_false_positive = True
        review_reason = "Helmet detected, but officer verification is required."
    else:
        manual_review_required = True
        review_reason = "No helmet-related object was detected. Officer must review manually."

    if inferred_violation_type:
        status = "success"
    elif has_helmet_violation:
        status = "low_confidence_violation"
    else:
        status = "no_violation_detected"

    return {
        "detections": detections,
        "detected_classes": sorted({str(item["class"]) for item in detections if item.get("class")}),
        "has_helmet_violation": has_helmet_violation,
        "inferred_violation_type": inferred_violation_type,
        "max_confidence": round(max_confidence, 4),
        "confidence_level": _confidence_band(max_confidence),
        "status": status,
        "provider": provider,
        "model_version": model_version,
        "error": error,
        "needs_manual_review": manual_review_required,
        "review_reason": review_reason,
        "possible_false_positive": possible_false_positive,
    }


def _normalize_roboflow_violation_result(result: dict[str, Any]) -> dict:
    model_version = str(result.get("model_id") or ROBOFLOW_HELMET_MODEL_ID)
    detections: list[dict[str, Any]] = []
    for item in result.get("detections", []):
        class_name = str(item.get("class", "unknown"))
        bbox = item.get("bbox") or {}
        confidence = round(float(item.get("confidence") or 0.0), 4)
        detections.append(
            {
                "class": class_name,
                "normalized_class": item.get("normalized_class", _normalize_violation_label(class_name)),
                "confidence": confidence,
                "confidence_level": item.get("confidence_level") or _confidence_band(confidence),
                "bbox": {
                    "x": round(float(bbox.get("x") or 0.0), 1),
                    "y": round(float(bbox.get("y") or 0.0), 1),
                    "width": round(float(bbox.get("width") or 0.0), 1),
                    "height": round(float(bbox.get("height") or 0.0), 1),
                },
                "bbox_xyxy": _center_bbox_to_xyxy(bbox),
            }
        )

    return {
        "detections": detections,
        "detected_classes": result.get("detected_classes", []),
        "has_helmet_violation": result.get("has_helmet_violation", False),
        "inferred_violation_type": result.get("inferred_violation_type"),
        "max_confidence": result.get("confidence", 0.0),
        "confidence_level": result.get("confidence_level", "low"),
        "needs_manual_review": result.get("manual_review_required", True),
        "review_reason": result.get("review_reason"),
        "possible_false_positive": result.get("possible_false_positive", False),
        "status": result.get("status", "no_detection"),
        "upstream_status": result.get("status", "no_detection"),
        "provider": str(result.get("provider") or "roboflow"),
        "model_version": model_version,
        "error": result.get("error"),
    }


def _should_use_local_helmet_fallback(result: dict[str, Any]) -> bool:
    return result["status"] in {
        "api_error",
        "dependency_error",
        "timeout",
    }


def _run_local_violation_detection(image_path: str) -> dict:
    """Detect helmet violations with the local YOLO model as an operational fallback."""
    model = _get_helmet_detector()
    if model is None:
        local_unavailable = _empty_violation_detection("model_unavailable")
        local_unavailable.update(
            {
                "provider": "local_yolo",
                "model_version": HELMET_MODEL_VERSION,
            }
        )
        return local_unavailable

    try:
        results = model.predict(source=image_path, verbose=False, device="cpu")
    except Exception as exc:
        logger.error("Violation detection failed for %s: %s", image_path, exc)
        detection_error = _empty_violation_detection("detection_error")
        detection_error.update(
            {
                "provider": "local_yolo",
                "model_version": HELMET_MODEL_VERSION,
                "error": str(exc),
            }
        )
        return detection_error

    detections: list[dict[str, Any]] = []
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

            confidence = round(float(box.conf[0]), 4)
            xyxy = box.xyxy[0].tolist()
            detections.append(
                {
                    "class": cls_name,
                    "normalized_class": _normalize_violation_label(cls_name),
                    "confidence": confidence,
                    "confidence_level": _confidence_band(confidence),
                    "bbox": _xyxy_to_center_bbox(xyxy),
                    "bbox_xyxy": {
                        "x1": round(xyxy[0], 1),
                        "y1": round(xyxy[1], 1),
                        "x2": round(xyxy[2], 1),
                        "y2": round(xyxy[3], 1),
                    },
                }
            )

    return _summarize_violation_detections(
        detections,
        provider="local_yolo",
        model_version=HELMET_MODEL_VERSION,
    )


def _run_violation_detection(image_path: str) -> dict:
    """
    Detect a no-helmet violation with Roboflow first and keep the local YOLO
    path available as a fallback when the hosted API is unavailable.
    """
    roboflow_result = _normalize_roboflow_violation_result(run_helmet_detection(image_path))
    if not _should_use_local_helmet_fallback(roboflow_result):
        return roboflow_result

    logger.warning(
        "Roboflow helmet detection unavailable for %s (%s). Falling back to local model.",
        image_path,
        roboflow_result["status"],
    )
    local_result = _run_local_violation_detection(image_path)
    local_result["fallback"] = {
        "provider": roboflow_result["provider"],
        "model_version": roboflow_result["model_version"],
        "status": roboflow_result["status"],
        "error": roboflow_result.get("error"),
    }
    if roboflow_result.get("error") and local_result["status"] in {"model_unavailable", "detection_error"}:
        local_error = local_result.get("error")
        if local_error:
            local_result["error"] = f"{local_error} | Roboflow fallback error: {roboflow_result['error']}"
        else:
            local_result["error"] = roboflow_result["error"]
    return local_result


def _is_plate_class(class_name: str) -> bool:
    """Check if a detected class name refers to a license plate."""
    normalized = class_name.lower().replace("_", " ")
    return any(hint in normalized for hint in PLATE_CLASS_HINTS)


def _run_plate_detection(image_path: str) -> dict:
    """
    Detect license plates using the dedicated YOLO model and return every box,
    plus the highest-confidence detection for downstream cropping.
    """
    model = _get_plate_detector()
    if model is None:
        return _empty_plate_detection("model_unavailable")

    try:
        results = model.predict(source=image_path, verbose=False, device="cpu", conf=PLATE_DETECT_CONFIDENCE)
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

            # Filter out non-plate classes (e.g. helmet, rider) from combined models
            if not _is_plate_class(cls_name):
                continue

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
    pipeline_result = run_anpr_pipeline(image_path)
    normalized_plate_text = pipeline_result.get("normalized_plate_text") or pipeline_result.get("plate_text")
    plate_bbox = pipeline_result.get("plate_bbox") or pipeline_result.get("bbox")
    status = pipeline_result.get("status", "pending")
    return {
        "plate_detected": bool(pipeline_result.get("plate_detected") or plate_bbox),
        "plate_text": pipeline_result.get("plate_text"),
        "normalized_plate_text": normalized_plate_text,
        "plate_confidence": round(float(pipeline_result.get("plate_confidence") or 0.0), 4),
        "ocr_confidence": round(float(pipeline_result.get("ocr_confidence") or 0.0), 4),
        "plate_bbox": plate_bbox,
        "bbox": plate_bbox,
        "crop_path": pipeline_result.get("crop_path"),
        "validation_status": pipeline_result.get("validation_status") or status,
        "detections": pipeline_result.get("detections", []),
        "detected_classes": pipeline_result.get("detected_classes", []),
        "num_detections": int(pipeline_result.get("num_detections") or 0),
        "detection_confidence": round(float(pipeline_result.get("detection_confidence") or 0.0), 4),
        "raw_text": pipeline_result.get("raw_text"),
        "ocr_candidates": pipeline_result.get("ocr_candidates", []),
        "status": status,
        "error": pipeline_result.get("error"),
    }


def _cleanup_temporary_evidence(image_path: str | None) -> None:
    if image_path and image_path.startswith(tempfile.gettempdir()):
        try:
            os.unlink(image_path)
        except OSError:
            logger.warning("Failed to remove temporary evidence file: %s", image_path)


def _manual_review_violation_result(
    claimed_violation_type: str | None,
    *,
    reason: str,
    status: str,
    error: str | None = None,
) -> dict[str, Any]:
    model_id = (
        ROBOFLOW_HELMET_MODEL_ID if claimed_violation_type == "helmet"
        else ROBOFLOW_RED_LIGHT_MODEL_ID if claimed_violation_type == "red_light"
        else ROBOFLOW_WHITE_LINE_MODEL_ID if claimed_violation_type == "white_line"
        else None
    )
    return {
        "violation_family": claimed_violation_type or "unknown",
        "status": status,
        "inferred_violation_type": None,
        "has_violation": False,
        "has_helmet_violation": False,
        "confidence": 0.0,
        "confidence_level": "none",
        "manual_review_required": True,
        "review_reason": reason,
        "detected_classes": [],
        "detections": [],
        "provider": "roboflow",
        "model_id": model_id,
        "error": error,
    }


def _run_selected_violation_detection(image_path: str | None, claimed_violation_type: str | None) -> dict[str, Any]:
    if not image_path:
        return _manual_review_violation_result(
            claimed_violation_type,
            reason="No usable evidence image was available for AI review.",
            status="failed",
        )

    if claimed_violation_type == "other":
        return _manual_review_violation_result(
            claimed_violation_type,
            reason="Citizen selected Other. Specialized violation models were skipped; ANPR and OCR were still attempted.",
            status="manual_review_required",
        )

    if claimed_violation_type == "helmet":
        result = run_helmet_detection(image_path)
        if result.get("status") in {"api_error", "configuration_error", "dependency_error", "timeout", "failed"}:
            logger.warning(
                "Hosted helmet inference unavailable for %s (%s). Trying local YOLO fallback.",
                image_path,
                result.get("status"),
            )
            hosted_error = result.get("error")
            local_result = _run_local_violation_detection(image_path)
            result = {
                "violation_family": "helmet",
                "status": local_result.get("status", "failed"),
                "inferred_violation_type": local_result.get("inferred_violation_type"),
                "has_violation": bool(local_result.get("has_helmet_violation")),
                "confidence": float(local_result.get("max_confidence") or 0.0),
                "confidence_level": local_result.get("confidence_level", "none"),
                "manual_review_required": bool(local_result.get("needs_manual_review", True)),
                "review_reason": local_result.get("review_reason"),
                "detected_classes": local_result.get("detected_classes", []),
                "detections": local_result.get("detections", []),
                "provider": "local_yolo",
                "model_id": local_result.get("model_version") or HELMET_MODEL_VERSION,
                "error": local_result.get("error"),
                "fallback": {
                    "provider": "roboflow",
                    "model_id": result.get("model_id") or ROBOFLOW_HELMET_MODEL_ID,
                    "status": result.get("status"),
                    "error": hosted_error,
                },
            }
    elif claimed_violation_type == "red_light":
        result = run_red_light_detection(image_path)
    elif claimed_violation_type == "white_line":
        result = run_white_line_detection(image_path)
    else:
        return _manual_review_violation_result(
            claimed_violation_type,
            reason="Unsupported violation type selected. Manual review is required.",
            status="failed",
            error="Unsupported claimed_violation_type",
        )

    result.setdefault("violation_family", claimed_violation_type or "unknown")
    result.setdefault("status", "failed")
    result.setdefault("inferred_violation_type", None)
    result.setdefault("has_violation", False)
    result.setdefault("confidence", 0.0)
    result.setdefault("confidence_level", "none")
    result.setdefault("manual_review_required", True)
    result.setdefault("review_reason", "Manual review required.")
    result.setdefault("detected_classes", [])
    result.setdefault("detections", [])
    result.setdefault("provider", "roboflow")
    result.setdefault("model_id", None)
    result.setdefault("error", None)
    result["has_helmet_violation"] = bool(result.get("violation_family") == "helmet" and result.get("has_violation"))
    return result


def attempt_inference(
    report: Report | EvidenceReport,
    db: Session,
    report_kind: Literal["legacy", "evidence"] = "legacy",
    attempt: int = 1,
):
    """Run the selected Roboflow violation model plus the ANPR pipeline placeholder."""
    logger.info("Starting inference job for %s report %s (Attempt %s)", report_kind, report.id, attempt)
    start_time = time.time()
    processed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    if report_kind == "legacy" and report.claimed_violation_type is None and report.violation_type is not None:
        # Legacy rows may still have only violation_type populated from before
        # the claimed/inferred/final split. Keep the citizen claim accessible.
        report.claimed_violation_type = report.violation_type

    claimed_violation_type = normalize_claimed_violation_type(
        report.claimed_violation_type if report_kind == "legacy" else report.violation_type
    )
    if report_kind == "legacy":
        report.claimed_violation_type = claimed_violation_type

    report_status_value = getattr(report.status, "value", report.status)
    if report_status_value == "SUBMITTED":
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
    violation_result = _run_selected_violation_detection(image_path, claimed_violation_type)
    anpr_result = _build_anpr_result(report.id, image_path)

    _cleanup_temporary_evidence(image_path)

    overall_confidence = round(float(violation_result.get("confidence") or 0.0), 4)
    confidence_band = str(violation_result.get("confidence_level") or "none")
    latency = time.time() - start_time
    inferred_violation_type = violation_result["inferred_violation_type"]
    if report_kind == "legacy":
        report.inferred_violation_type = inferred_violation_type
    elif not report.vehicle_plate and (anpr_result["normalized_plate_text"] or anpr_result["plate_text"]):
        report.vehicle_plate = anpr_result["normalized_plate_text"] or anpr_result["plate_text"]

    anpr_requires_manual_review = anpr_result.get("status") in {"model_missing", "no_plate", "ocr_failed", "failed"}
    violation_requires_manual_review = bool(
        violation_result.get(
            "manual_review_required",
            violation_result.get("needs_manual_review", True),
        )
    )
    manual_review_required = violation_requires_manual_review or anpr_requires_manual_review
    violation_review_reason = violation_result.get("review_reason")
    if anpr_requires_manual_review:
        anpr_status = anpr_result.get("status")
        if anpr_status == "no_plate":
            anpr_reason = "Plate number could not be automatically detected."
        elif anpr_status == "ocr_failed":
            anpr_reason = "Plate region was detected, but the plate number could not be automatically extracted."
        elif anpr_status == "model_missing":
            anpr_reason = "ANPR model is unavailable; officer manual plate review is required."
        else:
            anpr_reason = "Plate recognition needs officer verification or manual entry."
        violation_review_reason = f"{violation_review_reason} {anpr_reason}".strip() if violation_review_reason else anpr_reason
    if hasattr(report, "manual_review_required"):
        report.manual_review_required = manual_review_required

    bbox_payload = {
        "model_version": {
            "violation": violation_result.get("model_id"),
            "anpr": anpr_result.get("status", "pending"),
        },
        "processing_timestamp": processed_at.isoformat(),
        "violation_family": violation_result.get("violation_family"),
        "violation_detections": violation_result["detections"],
        "violation_detected_classes": violation_result["detected_classes"],
        "violation_detection_status": violation_result["status"],
        "violation_confidence": overall_confidence,
        "violation_confidence_level": violation_result["confidence_level"],
        "violation_provider": violation_result["provider"],
        "violation_model_id": violation_result.get("model_id"),
        "violation_fallback": violation_result.get("fallback"),
        "violation_error": violation_result["error"],
        "has_violation": bool(violation_result.get("has_violation")),
        "has_helmet_violation": bool(violation_result.get("has_helmet_violation")),
        "manual_review_required": manual_review_required,
        "needs_manual_review": manual_review_required,
        "violation_review_reason": violation_review_reason,
        "quality_score": overall_confidence,
        "confidence_band": confidence_band,
        "claimed_violation_type": claimed_violation_type,
        "inferred_violation_type": inferred_violation_type,
        "custom_violation_description": getattr(report, "custom_violation_description", None),
        "plate_detected": bool(anpr_result.get("plate_detected")),
        "plate_text": anpr_result["plate_text"],
        "normalized_plate_text": anpr_result["normalized_plate_text"],
        "plate_detection_confidence": round(anpr_result["plate_confidence"], 4),
        "plate_confidence": round(anpr_result["plate_confidence"], 4),
        "ocr_confidence": round(anpr_result["ocr_confidence"], 4),
        "plate_bbox": anpr_result["plate_bbox"],
        "crop_path": anpr_result["crop_path"],
        "validation_status": anpr_result["validation_status"],
        "anpr_status": anpr_result.get("status", anpr_result["validation_status"]),
        "anpr_error": anpr_result.get("error"),
        "anpr_output": anpr_result,
        "ocr_output": {
            "raw_text": anpr_result["raw_text"],
            "plate_text": anpr_result["plate_text"],
            "normalized_plate_text": anpr_result["normalized_plate_text"],
            "plate_confidence": round(anpr_result["plate_confidence"], 4),
            "ocr_confidence": round(anpr_result["ocr_confidence"], 4),
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

    inference_log.model_version = f"{violation_result.get('model_id') or 'unknown'}|anpr:{anpr_result.get('status', 'pending')}"
    inference_log.bbox_coordinates = bbox_payload
    inference_log.confidence = overall_confidence
    inference_log.ocr_text = anpr_result["normalized_plate_text"] or anpr_result["plate_text"]
    inference_log.ocr_confidence = round(anpr_result["ocr_confidence"], 4)
    inference_log.plate_text = anpr_result["plate_text"]
    inference_log.normalized_plate_text = anpr_result["normalized_plate_text"]
    inference_log.plate_confidence = round(anpr_result["plate_confidence"], 4)
    inference_log.plate_bbox = anpr_result["plate_bbox"]
    inference_log.anpr_status = anpr_result.get("status")
    inference_log.anpr_error = anpr_result.get("error")
    inference_log.plate_crop_path = anpr_result.get("crop_path")
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
        if violation_result["error"]:
            inference_log.bbox_coordinates["filtering"] = "Selected AI model failed; forwarded to manual review."
        elif manual_review_required:
            inference_log.bbox_coordinates["filtering"] = violation_review_reason or "Manual review required."
        elif inferred_violation_type is None:
            inference_log.bbox_coordinates["filtering"] = "AI could not confirm the reported violation."
        else:
            inference_log.bbox_coordinates["filtering"] = "AI completed and the case is ready for officer review."

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
            "plate_detections": anpr_result.get("num_detections", 0),
            "ocr_text": anpr_result["normalized_plate_text"] or anpr_result["plate_text"],
            "validation_status": anpr_result["validation_status"],
            "claimed_violation_type": claimed_violation_type,
            "inferred_violation_type": inferred_violation_type,
            "violation_family": violation_result.get("violation_family"),
            "violation_provider": violation_result["provider"],
            "violation_detection_status": violation_result["status"],
            "violation_confidence": overall_confidence,
            "violation_confidence_level": violation_result["confidence_level"],
            "manual_review_required": manual_review_required,
            "needs_manual_review": manual_review_required,
            "has_violation": bool(violation_result.get("has_violation")),
            "anpr_status": anpr_result.get("status", "pending"),
            "anpr_error": anpr_result.get("error"),
            "attempt": attempt,
        },
    )
    db.add(audit)
    db.commit()

    # In-app notifications for AI analysis completion — best-effort.
    if report_kind == "evidence":
        try:
            citizen_id = getattr(report, "citizen_id", None)
            report_id_val = report.id
            tracking_id_val = getattr(report, "tracking_id", report_id_val)
            district_val = getattr(report, "location_district", None)
            inference_failed = bool(violation_result.get("error"))

            if citizen_id:
                notify_citizen(
                    db, citizen_id,
                    title="AI analysis completed",
                    message="Your report has been analysed by AI and is now waiting for police review.",
                    notification_type="ai_analysis_completed",
                    related_entity_type="evidence_report",
                    related_entity_id=report_id_val,
                    metadata={
                        "tracking_id": tracking_id_val,
                        "confidence": overall_confidence,
                        "district": district_val,
                    },
                )

            review_priority = "high" if (overall_confidence >= HIGH_CONFIDENCE_THRESHOLD and not manual_review_required) else "normal"
            notify_police(
                db,
                title="AI analysis completed" if not inference_failed else "AI analysis needs review",
                message=(
                    f"AI results are available for report {tracking_id_val}"
                    + (f" from {district_val}" if district_val else "")
                    + ". "
                    + (f"High-confidence ({overall_confidence:.0%}) — ready for officer decision." if review_priority == "high" else "Manual review is recommended.")
                ),
                notification_type="ai_analysis_completed",
                related_entity_type="evidence_report",
                related_entity_id=report_id_val,
                priority=review_priority,
                metadata={
                    "tracking_id": tracking_id_val,
                    "confidence": overall_confidence,
                    "manual_review_required": manual_review_required,
                    "district": district_val,
                },
            )

            if inference_failed:
                notify_admins(
                    db,
                    title="AI inference failed",
                    message=f"AI inference failed for report {tracking_id_val}: {violation_result.get('error')}",
                    notification_type="ai_inference_failed",
                    related_entity_type="evidence_report",
                    related_entity_id=report_id_val,
                    priority="high",
                    metadata={
                        "tracking_id": tracking_id_val,
                        "error": violation_result.get("error"),
                        "district": district_val,
                    },
                )

            db.commit()
        except Exception as _notif_exc:
            logger.error("Notification dispatch failed after inference: %s", _notif_exc)

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
                    # Notify admins of persistent inference failure.
                    try:
                        notify_admins(
                            db,
                            title="AI inference failed",
                            message=f"AI inference failed for {report_kind} report {report_id} after {max_retries} retries: {exc}",
                            notification_type="ai_inference_failed",
                            related_entity_type="evidence_report" if report_kind == "evidence" else "report",
                            related_entity_id=report_id,
                            priority="high",
                            metadata={"report_kind": report_kind, "error": str(exc), "attempts": max_retries},
                        )
                        db.commit()
                    except Exception as _n_exc:
                        logger.error("Failed to send inference-failure admin notification: %s", _n_exc)
                    raise
                time.sleep(2)
    finally:
        db.close()

from __future__ import annotations

import logging
import re
import tempfile
import time
from pathlib import Path
from typing import Any

import cv2

try:
    from services.ml.api.env import get_env_value, load_service_env
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import get_env_value, load_service_env

try:
    from services.ml.inference.ocr_pipeline import OCRPipeline
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.inference", "services.ml.inference.ocr_pipeline"}:
        raise
    from inference.ocr_pipeline import OCRPipeline

try:
    from services.ml.inference.plate_format import normalize_sri_lankan_plate
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.inference", "services.ml.inference.plate_format"}:
        raise
    from inference.plate_format import normalize_sri_lankan_plate


logger = logging.getLogger(__name__)
load_service_env()

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "temp" / "anpr_crops"
DEFAULT_ANPR_MODEL_PATH = MODELS_DIR / "anpr_best.pt"
PLATE_CLASS_HINTS = ("plate", "license", "licence", "number")

_plate_detector = None
_plate_detector_load_attempted = False
_ocr_pipeline: OCRPipeline | None = None


def _env_path_or_default(env_var_name: str, default_path: Path) -> Path:
    raw_value = get_env_value(env_var_name)
    if raw_value and raw_value.strip():
        configured_path = Path(raw_value.strip()).expanduser()
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
    return default_path


def _get_plate_detector():
    global _plate_detector, _plate_detector_load_attempted

    if _plate_detector is not None:
        return _plate_detector
    if _plate_detector_load_attempted:
        return None

    _plate_detector_load_attempted = True
    model_path = _env_path_or_default("ANPR_MODEL_PATH", DEFAULT_ANPR_MODEL_PATH)
    if not model_path.exists():
        logger.warning("ANPR model not found at %s. Plate detection is unavailable.", model_path)
        return None

    try:
        from ultralytics import YOLO
    except ImportError:
        logger.warning("ultralytics is not installed. Plate detection is unavailable.")
        return None

    _plate_detector = YOLO(str(model_path))
    logger.info("ANPR plate detector ready: %s", model_path)
    return _plate_detector


def _get_ocr_pipeline() -> OCRPipeline:
    global _ocr_pipeline
    if _ocr_pipeline is None:
        _ocr_pipeline = OCRPipeline()
    return _ocr_pipeline


def _empty_result(status: str, *, error: str | None = None) -> dict[str, Any]:
    return {
        "plate_detected": False,
        "plate_text": None,
        "normalized_plate_text": None,
        "plate_confidence": 0.0,
        "ocr_confidence": 0.0,
        "plate_bbox": None,
        "bbox": None,
        "crop_path": None,
        "status": status,
        "validation_status": status,
        "raw_text": None,
        "ocr_candidates": [],
        "detections": [],
        "detected_classes": [],
        "num_detections": 0,
        "detection_confidence": 0.0,
        "error": error,
    }


def _class_name(names: dict | list | None, cls_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(cls_id, "License_Plate"))
    if isinstance(names, list) and 0 <= cls_id < len(names):
        return str(names[cls_id])
    return "License_Plate"


def _is_plate_class(class_name: str) -> bool:
    normalized = class_name.lower().replace("_", " ")
    return any(hint in normalized for hint in PLATE_CLASS_HINTS)


def _detect_plates(image_path: str) -> tuple[list[dict[str, Any]], str | None]:
    model = _get_plate_detector()
    if model is None:
        return [], "model_missing"

    try:
        results = model.predict(source=image_path, verbose=False, device="cpu")
    except Exception as exc:
        logger.exception("ANPR plate detection failed for %s", image_path)
        return [], str(exc)

    detections: list[dict[str, Any]] = []
    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue

        for box in boxes:
            cls_id = int(box.cls[0]) if getattr(box, "cls", None) is not None else 0
            class_name = _class_name(getattr(result, "names", None), cls_id)
            if not _is_plate_class(class_name):
                continue

            xyxy = box.xyxy[0].tolist()
            confidence = round(float(box.conf[0]), 4)
            detections.append(
                {
                    "class": class_name,
                    "confidence": confidence,
                    "bbox": {
                        "x1": round(float(xyxy[0]), 1),
                        "y1": round(float(xyxy[1]), 1),
                        "x2": round(float(xyxy[2]), 1),
                        "y2": round(float(xyxy[3]), 1),
                    },
                }
            )

    return detections, None


def _crop_plate(image_path: str, bbox: dict[str, float]) -> tuple[Any | None, str | None]:
    image = cv2.imread(image_path)
    if image is None:
        return None, None

    height, width = image.shape[:2]
    x1 = max(0, int(bbox["x1"]) - 4)
    y1 = max(0, int(bbox["y1"]) - 4)
    x2 = min(width, int(bbox["x2"]) + 4)
    y2 = min(height, int(bbox["y2"]) + 4)
    if x2 <= x1 or y2 <= y1:
        return None, None

    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return None, None

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    crop_path = TEMP_DIR / f"plate_{int(time.time() * 1000)}.png"
    cv2.imwrite(str(crop_path), crop)
    try:
        relative_crop_path = str(crop_path.resolve().relative_to(BASE_DIR.resolve()))
    except ValueError:
        relative_crop_path = str(crop_path.resolve())
    return crop, relative_crop_path


def _run_ocr(image_or_crop) -> dict[str, Any]:
    ocr_result = _get_ocr_pipeline().extract_text(image_or_crop)
    raw_text = ocr_result.get("text") or ocr_result.get("all_text")
    normalized = normalize_sri_lankan_plate(raw_text)
    confidence = round(float(ocr_result.get("confidence") or 0.0), 4)
    return {
        "plate_text": raw_text,
        "normalized_plate_text": normalized.normalized_text,
        "ocr_confidence": confidence,
        "raw_text": raw_text,
        "validation_status": normalized.status if normalized.normalized_text else ocr_result.get("status", "no_text_detected"),
        "ocr_candidates": [
            {
                "raw_text": raw_text,
                "normalized_plate_text": normalized.normalized_text,
                "display_text": normalized.display_text,
                "confidence": confidence,
                "validation_status": normalized.status,
            }
        ] if raw_text else [],
    }


def run_anpr_pipeline(image_path: str | None) -> dict[str, Any]:
    if not image_path:
        return _empty_result("failed", error="No image path was provided.")

    image_file = Path(image_path)
    if not image_file.exists():
        return _empty_result("failed", error=f"Image file not found: {image_path}")

    detections, detection_error = _detect_plates(str(image_file))
    if detection_error and not detections:
        status = "model_missing" if detection_error == "model_missing" else "failed"
        return _empty_result(status, error=None if status == "model_missing" else detection_error)

    best_detection = max(detections, key=lambda item: item["confidence"], default=None)
    if not best_detection:
        return _empty_result("no_plate")

    crop, crop_path = _crop_plate(str(image_file), best_detection["bbox"])
    if crop is None:
        return {
            **_empty_result("failed", error="Plate detector returned an invalid crop."),
            "plate_detected": True,
            "plate_confidence": best_detection["confidence"],
            "plate_bbox": best_detection["bbox"],
            "bbox": best_detection["bbox"],
            "crop_path": crop_path,
            "detections": detections,
            "detected_classes": sorted({item["class"] for item in detections}),
            "num_detections": len(detections),
            "detection_confidence": best_detection["confidence"],
        }

    ocr_result = _run_ocr(crop)
    ocr_succeeded = bool(ocr_result.get("normalized_plate_text"))
    status = "success" if ocr_succeeded else "ocr_failed"
    return {
        "plate_detected": True,
        "plate_text": ocr_result["plate_text"],
        "normalized_plate_text": ocr_result["normalized_plate_text"],
        "plate_confidence": best_detection["confidence"],
        "ocr_confidence": ocr_result["ocr_confidence"],
        "plate_bbox": best_detection["bbox"],
        "bbox": best_detection["bbox"],
        "crop_path": crop_path,
        "validation_status": ocr_result["validation_status"],
        "status": status,
        "raw_text": ocr_result["raw_text"],
        "ocr_candidates": ocr_result["ocr_candidates"],
        "detections": detections,
        "detected_classes": sorted({item["class"] for item in detections}),
        "num_detections": len(detections),
        "detection_confidence": best_detection["confidence"],
        "error": None,
    }

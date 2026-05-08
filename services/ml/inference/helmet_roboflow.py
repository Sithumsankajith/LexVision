from __future__ import annotations

from typing import Any

try:
    from services.ml.api.env import ROBOFLOW_HELMET_DEFAULT_MODEL_ID
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import ROBOFLOW_HELMET_DEFAULT_MODEL_ID

try:
    from services.ml.inference.roboflow_common import (
        build_empty_summary,
        confidence_level,
        env_setting,
        infer_predictions,
    )
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.inference", "services.ml.inference.roboflow_common"}:
        raise
    from inference.roboflow_common import (
        build_empty_summary,
        confidence_level,
        env_setting,
        infer_predictions,
    )

import logging
from pathlib import Path
from ultralytics import YOLO

logger = logging.getLogger(__name__)

LOCAL_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "helmet_best.pt"
_local_model = None


ROBOFLOW_HELMET_MODEL_ID = ROBOFLOW_HELMET_DEFAULT_MODEL_ID
HELMET_VIOLATION_THRESHOLD = float(env_setting("HELMET_VIOLATION_THRESHOLD", "0.65") or "0.65")


def normalize_class(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"no_helmet", "nohelmet", "without_helmet", "no_helmet_front", "no_helmet_back", "wrong_helmet"}:
        return "no-helmet"
    if normalized in {"helmet", "with_helmet", "yes_helmet"}:
        return "helmet"
    return normalized.replace("_", "-")


def _default_summary(*, model_id: str, status: str, review_reason: str, error: str | None = None) -> dict[str, Any]:
    summary = build_empty_summary(
        violation_family="helmet",
        model_id=model_id,
        status=status,
        review_reason=review_reason,
        error=error,
    )
    summary["has_helmet_violation"] = False
    return summary


def get_local_model() -> Any | None:
    global _local_model
    if _local_model is not None:
        return _local_model
    
    if LOCAL_MODEL_PATH.exists():
        try:
            _local_model = YOLO(str(LOCAL_MODEL_PATH))
            logger.info("Loaded local fallback model from %s", LOCAL_MODEL_PATH)
            return _local_model
        except Exception as e:
            logger.error("Failed to load local fallback model: %s", e)
    return None


def run_local_fallback(image_path: str, model_id: str) -> list[dict[str, Any]] | None:
    model = get_local_model()
    if model is None:
        return None

    try:
        results = model(image_path, verbose=False)
        if not results:
            return []

        result = results[0]
        predictions = []
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            class_name = result.names[class_id]
            x, y, w, h = box.xywh[0].tolist()

            predictions.append({
                "class": class_name,
                "confidence": confidence,
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "provider": "local",
            })
        return predictions
    except Exception as e:
        logger.error("Local fallback inference failed: %s", e)
        return None


def run_helmet_detection(image_path: str) -> dict[str, Any]:
    model_id = env_setting("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_MODEL_ID) or ROBOFLOW_HELMET_MODEL_ID
    prediction_result = infer_predictions(image_path, model_id=model_id)

    predictions = None
    provider = "roboflow"
    
    if isinstance(prediction_result, dict):
        if prediction_result.get("status") in ("failed", "timeout", "api_error", "configuration_error"):
            # Try local fallback
            fallback_preds = run_local_fallback(image_path, model_id)
            if fallback_preds is not None:
                predictions = fallback_preds
                provider = "local"
            else:
                prediction_result["violation_family"] = "helmet"
                prediction_result["model_id"] = model_id
                prediction_result["has_helmet_violation"] = False
                return prediction_result
        else:
            prediction_result["violation_family"] = "helmet"
            prediction_result["model_id"] = model_id
            prediction_result["has_helmet_violation"] = False
            return prediction_result
    else:
        predictions = prediction_result

    if not predictions:
        fallback_preds = run_local_fallback(image_path, model_id)
        if fallback_preds is not None and fallback_preds:
            predictions = fallback_preds
            provider = "local"
        else:
            return _default_summary(
                model_id=model_id,
                status="no_detection",
                review_reason="AI could not confirm a helmet-related result.",
            )

    detections: list[dict[str, Any]] = []
    detected_classes: list[str] = []
    best_violation_confidence = 0.0
    has_helmet_detection = False

    for prediction in predictions:
        class_name = str(prediction.get("class", "unknown"))
        normalized_class = normalize_class(class_name)
        confidence = round(float(prediction.get("confidence") or 0.0), 4)
        bbox = {
            "x": round(float(prediction.get("x") or 0.0), 1),
            "y": round(float(prediction.get("y") or 0.0), 1),
            "width": round(float(prediction.get("width") or 0.0), 1),
            "height": round(float(prediction.get("height") or 0.0), 1),
        }

        detections.append(
            {
                "class": class_name,
                "normalized_class": normalized_class,
                "confidence": confidence,
                "confidence_level": confidence_level(confidence),
                "bbox": bbox,
            }
        )
        detected_classes.append(class_name)

        if normalized_class == "no-helmet":
            best_violation_confidence = max(best_violation_confidence, confidence)
        if normalized_class == "helmet":
            has_helmet_detection = True

    has_violation = best_violation_confidence >= HELMET_VIOLATION_THRESHOLD
    manual_review_required = not has_violation
    review_reason = None
    inferred_violation_type = "NO_HELMET" if has_violation else None

    if not has_violation:
        if best_violation_confidence > 0:
            review_reason = "AI could not confirm a helmet violation confidently."
        elif has_helmet_detection:
            review_reason = "AI detected a helmet, but the officer should confirm the rider is wearing it correctly."
        else:
            review_reason = "AI could not confirm a helmet-related result."

    return {
        "violation_family": "helmet",
        "status": "success" if has_violation else "no_detection",
        "inferred_violation_type": inferred_violation_type,
        "has_violation": has_violation,
        "has_helmet_violation": has_violation,
        "confidence": round(best_violation_confidence, 4),
        "confidence_level": confidence_level(best_violation_confidence) if best_violation_confidence > 0 else "none",
        "manual_review_required": manual_review_required,
        "review_reason": review_reason,
        "detected_classes": sorted(set(detected_classes)),
        "detections": detections,
        "provider": provider,
        "model_id": "local_best" if provider == "local" else model_id,
        "error": None,
    }

from __future__ import annotations

from typing import Any

try:
    from services.ml.api.env import ROBOFLOW_RED_LIGHT_DEFAULT_MODEL_ID
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import ROBOFLOW_RED_LIGHT_DEFAULT_MODEL_ID

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


ROBOFLOW_RED_LIGHT_MODEL_ID = ROBOFLOW_RED_LIGHT_DEFAULT_MODEL_ID
RED_LIGHT_THRESHOLD = float(env_setting("RED_LIGHT_VIOLATION_THRESHOLD", "0.55") or "0.55")


def normalize_class(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"red_light", "redlight", "red_light_violation", "violation"}:
        return "red_light"
    if normalized in {"traffic_light", "traffic_signal"}:
        return "traffic_light"
    return normalized


def run_red_light_detection(image_path: str) -> dict[str, Any]:
    model_id = env_setting("ROBOFLOW_RED_LIGHT_MODEL_ID", ROBOFLOW_RED_LIGHT_MODEL_ID) or ROBOFLOW_RED_LIGHT_MODEL_ID
    prediction_result = infer_predictions(image_path, model_id=model_id)

    if isinstance(prediction_result, dict):
        prediction_result["violation_family"] = "red_light"
        prediction_result["model_id"] = model_id
        return prediction_result

    predictions = prediction_result
    if not predictions:
        return build_empty_summary(
            violation_family="red_light",
            model_id=model_id,
            status="no_detection",
            review_reason="AI cannot confirm red-light violation",
        )

    detections: list[dict[str, Any]] = []
    detected_classes: list[str] = []
    best_violation_confidence = 0.0

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

        if normalized_class == "red_light":
            best_violation_confidence = max(best_violation_confidence, confidence)

    has_violation = best_violation_confidence >= RED_LIGHT_THRESHOLD
    return {
        "violation_family": "red_light",
        "status": "success" if has_violation else "no_detection",
        "inferred_violation_type": "RED_LIGHT" if has_violation else None,
        "has_violation": has_violation,
        "confidence": round(best_violation_confidence, 4),
        "confidence_level": confidence_level(best_violation_confidence) if best_violation_confidence > 0 else "none",
        "manual_review_required": not has_violation,
        "review_reason": None if has_violation else "AI cannot confirm red-light violation",
        "detected_classes": sorted(set(detected_classes)),
        "detections": detections,
        "provider": "roboflow",
        "model_id": model_id,
        "error": None,
    }

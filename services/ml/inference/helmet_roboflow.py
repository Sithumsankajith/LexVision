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


def run_helmet_detection(image_path: str) -> dict[str, Any]:
    model_id = env_setting("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_MODEL_ID) or ROBOFLOW_HELMET_MODEL_ID
    prediction_result = infer_predictions(image_path, model_id=model_id)

    if isinstance(prediction_result, dict):
        prediction_result["violation_family"] = "helmet"
        prediction_result["model_id"] = model_id
        prediction_result["has_helmet_violation"] = False
        return prediction_result

    predictions = prediction_result
    if not predictions:
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
        "provider": "roboflow",
        "model_id": model_id,
        "error": None,
    }

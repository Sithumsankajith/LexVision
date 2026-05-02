from __future__ import annotations

from typing import Any

try:
    from services.ml.api.env import ROBOFLOW_WHITE_LINE_DEFAULT_MODEL_ID
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import ROBOFLOW_WHITE_LINE_DEFAULT_MODEL_ID

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


ROBOFLOW_WHITE_LINE_MODEL_ID = ROBOFLOW_WHITE_LINE_DEFAULT_MODEL_ID


def normalize_class(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    if "cross" in normalized:
        return "white_line_crossing"
    if normalized in {"white_line", "whiteline"}:
        return "white_line"
    if normalized in {"lane", "lane_line"}:
        return "lane"
    if normalized in {"road_line", "roadline"}:
        return "road_line"
    return normalized


def run_white_line_detection(image_path: str) -> dict[str, Any]:
    model_id = env_setting("ROBOFLOW_WHITE_LINE_MODEL_ID", ROBOFLOW_WHITE_LINE_MODEL_ID) or ROBOFLOW_WHITE_LINE_MODEL_ID
    prediction_result = infer_predictions(image_path, model_id=model_id)

    if isinstance(prediction_result, dict):
        prediction_result["violation_family"] = "white_line"
        prediction_result["model_id"] = model_id
        return prediction_result

    predictions = prediction_result
    if not predictions:
        return build_empty_summary(
            violation_family="white_line",
            model_id=model_id,
            status="no_detection",
            review_reason="White line detected but crossing must be verified",
        )

    detections: list[dict[str, Any]] = []
    detected_classes: list[str] = []
    best_violation_confidence = 0.0
    saw_line_signal = False

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

        if normalized_class in {"white_line", "lane", "road_line"}:
            saw_line_signal = True
        if normalized_class == "white_line_crossing":
            best_violation_confidence = max(best_violation_confidence, confidence)

    has_violation = best_violation_confidence > 0
    review_reason = None
    if not has_violation:
        review_reason = "White line detected but crossing must be verified" if saw_line_signal else "AI could not confirm white-line violation"

    return {
        "violation_family": "white_line",
        "status": "success" if has_violation else "no_detection",
        "inferred_violation_type": "WHITE_LINE" if has_violation else None,
        "has_violation": has_violation,
        "confidence": round(best_violation_confidence, 4),
        "confidence_level": confidence_level(best_violation_confidence) if best_violation_confidence > 0 else "none",
        "manual_review_required": not has_violation,
        "review_reason": review_reason,
        "detected_classes": sorted(set(detected_classes)),
        "detections": detections,
        "provider": "roboflow",
        "model_id": model_id,
        "error": None,
    }

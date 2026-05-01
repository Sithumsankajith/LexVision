from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

try:
    from services.ml.api.env import (
        ROBOFLOW_DEFAULT_API_URL,
        ROBOFLOW_DEFAULT_MODEL_ID,
        get_env_value,
        get_roboflow_config,
        load_service_env,
    )
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import (
        ROBOFLOW_DEFAULT_API_URL,
        ROBOFLOW_DEFAULT_MODEL_ID,
        get_env_value,
        get_roboflow_config,
        load_service_env,
    )


logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BASE_DIR / ".env"
load_service_env()

ROBOFLOW_API_URL = ROBOFLOW_DEFAULT_API_URL
ROBOFLOW_HELMET_MODEL_ID = ROBOFLOW_DEFAULT_MODEL_ID
HIGH_CONFIDENCE_THRESHOLD = 0.8
MEDIUM_CONFIDENCE_THRESHOLD = 0.5

_VIOLATION_LABEL_ALIASES = {
    "helmet": "helmet",
    "helmeted": "helmet",
    "withhelmet": "helmet",
    "with_helmet": "helmet",
    "nohelmet": "no-helmet",
    "no_helmet": "no-helmet",
    "no-helmet": "no-helmet",
    "withouthelmet": "no-helmet",
    "without_helmet": "no-helmet",
    "notwearinghelmet": "no-helmet",
    "not_wearing_helmet": "no-helmet",
    "not wearing helmet": "no-helmet",
    "not wearing helment": "no-helmet",
}

_client = None
_client_error: str | None = None
_client_signature: tuple[str, str] | None = None


def _env_setting(name: str, default: str | None = None) -> str | None:
    return get_env_value(name, default)


def _confidence_level(score: float) -> str:
    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def _safe_result(error: str | None, *, status: str) -> dict[str, Any]:
    return {
        "detections": [],
        "detected_classes": [],
        "has_helmet_violation": False,
        "confidence": 0.0,
        "confidence_level": "low",
        "status": status,
        "provider": "roboflow",
        "model_id": _env_setting("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_MODEL_ID),
        "error": error,
    }


def _normalize_label(label: str | None) -> str | None:
    if not label:
        return None

    normalized_key = "".join(char for char in label.strip().lower() if char.isalnum())
    if not normalized_key:
        return None
    return _VIOLATION_LABEL_ALIASES.get(normalized_key)


def _is_helmet_violation(label: str | None) -> bool:
    return _normalize_label(label) == "no-helmet"


def _extract_predictions(response: Any) -> list[dict[str, Any]]:
    if isinstance(response, dict):
        predictions = response.get("predictions")
        if isinstance(predictions, list):
            return [item for item in predictions if isinstance(item, dict)]

    if isinstance(response, list):
        extracted: list[dict[str, Any]] = []
        for item in response:
            if not isinstance(item, dict):
                continue
            predictions = item.get("predictions")
            if isinstance(predictions, list):
                extracted.extend(pred for pred in predictions if isinstance(pred, dict))
        return extracted

    return []


def _get_client():
    global _client, _client_error, _client_signature

    api_key = _env_setting("ROBOFLOW_API_KEY")
    if not api_key:
        _client = None
        _client_signature = None
        _client_error = "ROBOFLOW_API_KEY is not set."
        logger.warning("Roboflow helmet inference is disabled because ROBOFLOW_API_KEY is missing.")
        return None

    api_url = _env_setting("ROBOFLOW_API_URL", ROBOFLOW_API_URL) or ROBOFLOW_API_URL
    signature = (api_url, api_key)
    if _client is not None and _client_signature == signature:
        return _client

    try:
        from inference_sdk import InferenceHTTPClient
    except ImportError:
        _client = None
        _client_signature = None
        _client_error = "inference-sdk is not installed."
        logger.exception("Roboflow helmet inference dependency is missing.")
        return None

    _client = InferenceHTTPClient(
        api_url=api_url,
        api_key=api_key,
    )
    _client_signature = signature
    _client_error = None
    safe_config = get_roboflow_config()
    logger.info(
        "Roboflow helmet client initialized | api_key=%s | model_id=%s | api_url=%s",
        safe_config["api_key_masked"] or "<missing>",
        _env_setting("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_MODEL_ID),
        api_url,
    )
    return _client


def run_helmet_detection(image_path: str) -> dict[str, Any]:
    """
    Run hosted Roboflow helmet detection on an image file.

    The returned payload is safe to store directly in inference logs and always
    remains JSON-serializable, even when the upstream API fails.
    """
    image_file = Path(image_path).expanduser()
    if not image_file.is_file():
        error = f"Image file not found: {image_file}"
        logger.error(error)
        return _safe_result(error, status="invalid_image")

    client = _get_client()
    if client is None:
        status = "configuration_error" if _client_error and "ROBOFLOW_API_KEY" in _client_error else "dependency_error"
        return _safe_result(_client_error or "Roboflow client is unavailable.", status=status)

    model_id = _env_setting("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_MODEL_ID) or ROBOFLOW_HELMET_MODEL_ID
    try:
        response = client.infer(str(image_file), model_id=model_id)
    except TimeoutError:
        logger.exception("Roboflow helmet detection timed out for %s.", image_file)
        return _safe_result("Roboflow request timed out.", status="timeout")
    except Exception as exc:
        error_message = str(exc).strip() or exc.__class__.__name__
        if "timeout" in error_message.lower():
            logger.exception("Roboflow helmet detection timed out for %s.", image_file)
            return _safe_result("Roboflow request timed out.", status="timeout")
        logger.exception("Roboflow helmet detection failed for %s.", image_file)
        return _safe_result(error_message, status="api_error")

    predictions = _extract_predictions(response)
    if not predictions:
        logger.info("Roboflow helmet detection returned no predictions for %s.", image_file)
        return _safe_result(None, status="no_detection")

    detections: list[dict[str, Any]] = []
    detected_classes: set[str] = set()
    best_violation_confidence = 0.0
    has_helmet_violation = False

    for prediction in predictions:
        class_name = str(prediction.get("class", "unknown"))
        confidence = round(float(prediction.get("confidence") or 0.0), 4)
        bbox = {
            "x": round(float(prediction.get("x") or 0.0), 1),
            "y": round(float(prediction.get("y") or 0.0), 1),
            "width": round(float(prediction.get("width") or 0.0), 1),
            "height": round(float(prediction.get("height") or 0.0), 1),
        }
        normalized_class = _normalize_label(class_name)
        violation_candidate = _is_helmet_violation(class_name)

        detections.append(
            {
                "class": class_name,
                "normalized_class": normalized_class,
                "confidence": confidence,
                "confidence_level": _confidence_level(confidence),
                "bbox": bbox,
                "is_violation_candidate": violation_candidate,
            }
        )
        detected_classes.add(class_name)

        if violation_candidate:
            has_helmet_violation = True
            best_violation_confidence = max(best_violation_confidence, confidence)

    return {
        "detections": detections,
        "detected_classes": sorted(detected_classes),
        "has_helmet_violation": has_helmet_violation,
        "confidence": round(best_violation_confidence, 4),
        "confidence_level": _confidence_level(best_violation_confidence),
        "status": "success" if has_helmet_violation else "no_violation_detected",
        "provider": "roboflow",
        "model_id": model_id,
        "error": None,
    }

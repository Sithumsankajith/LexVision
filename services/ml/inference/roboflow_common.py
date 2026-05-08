from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

try:
    from services.ml.api.env import (
        ROBOFLOW_DEFAULT_API_URL,
        get_env_value,
        get_roboflow_config,
        load_service_env,
    )
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.api", "services.ml.api.env"}:
        raise
    from api.env import (
        ROBOFLOW_DEFAULT_API_URL,
        get_env_value,
        get_roboflow_config,
        load_service_env,
    )


logger = logging.getLogger(__name__)

load_service_env()

HIGH_CONFIDENCE_THRESHOLD = 0.8
MEDIUM_CONFIDENCE_THRESHOLD = 0.5

_client = None
_client_error: str | None = None
_client_signature: tuple[str, str] | None = None


def env_setting(name: str, default: str | None = None) -> str | None:
    return get_env_value(name, default)


def confidence_level(score: float) -> str:
    if score >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def extract_predictions(response: Any) -> list[dict[str, Any]]:
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


def get_client():
    global _client, _client_error, _client_signature

    api_key = env_setting("ROBOFLOW_API_KEY")
    if not api_key:
        _client = None
        _client_signature = None
        _client_error = "ROBOFLOW_API_KEY is not set."
        logger.warning("Roboflow inference is disabled because ROBOFLOW_API_KEY is missing.")
        return None

    api_url = env_setting("ROBOFLOW_API_URL", ROBOFLOW_DEFAULT_API_URL) or ROBOFLOW_DEFAULT_API_URL
    signature = (api_url, api_key)
    if _client is not None and _client_signature == signature:
        return _client

    try:
        from inference_sdk import InferenceHTTPClient
    except ImportError:
        _client = None
        _client_signature = None
        _client_error = "inference-sdk is not installed."
        logger.exception("Roboflow inference dependency is missing.")
        return None

    _client = InferenceHTTPClient(api_url=api_url, api_key=api_key)
    _client_signature = signature
    _client_error = None
    safe_config = get_roboflow_config()
    logger.info(
        "Roboflow client initialized | api_key=%s | api_url=%s",
        safe_config["api_key_masked"] or "<missing>",
        api_url,
    )
    return _client


def get_client_error() -> str | None:
    return _client_error


def build_empty_summary(
    *,
    violation_family: str,
    model_id: str,
    status: str,
    review_reason: str,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "violation_family": violation_family,
        "status": status,
        "inferred_violation_type": None,
        "has_violation": False,
        "confidence": 0.0,
        "confidence_level": "none",
        "manual_review_required": True,
        "review_reason": review_reason,
        "detected_classes": [],
        "detections": [],
        "provider": "roboflow",
        "model_id": model_id,
        "error": error,
    }


def infer_predictions(image_path: str, *, model_id: str) -> list[dict[str, Any]] | dict[str, Any]:
    image_file = Path(image_path).expanduser()
    if not image_file.is_file():
        return build_empty_summary(
            violation_family="unknown",
            model_id=model_id,
            status="failed",
            review_reason="AI inference failed. Officer must rely on original evidence.",
            error=f"Image file not found: {image_file}",
        )

    client = get_client()
    if client is None:
        return build_empty_summary(
            violation_family="unknown",
            model_id=model_id,
            status="configuration_error",
            review_reason="AI inference failed. Officer must rely on original evidence.",
            error=get_client_error() or "Roboflow client is unavailable.",
        )

    try:
        response = client.infer(str(image_file), model_id=model_id)
    except TimeoutError:
        logger.exception("Roboflow request timed out for %s.", image_file)
        return build_empty_summary(
            violation_family="unknown",
            model_id=model_id,
            status="timeout",
            review_reason="AI inference failed. Officer must rely on original evidence.",
            error="Roboflow request timed out.",
        )
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        logger.exception("Roboflow request failed for %s.", image_file)
        status = "timeout" if "timeout" in message.lower() or "timed out" in message.lower() else "api_error"
        return build_empty_summary(
            violation_family="unknown",
            model_id=model_id,
            status=status,
            review_reason="AI inference failed. Officer must rely on original evidence.",
            error=message,
        )

    return extract_predictions(response)

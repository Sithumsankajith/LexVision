from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
ROBOFLOW_DEFAULT_API_URL = "https://serverless.roboflow.com"
ROBOFLOW_HELMET_DEFAULT_MODEL_ID = "helmet-no-helmet-detection/1"
ROBOFLOW_RED_LIGHT_DEFAULT_MODEL_ID = "red-light-violation-detect-dataset-a9rsa/1"
ROBOFLOW_WHITE_LINE_DEFAULT_MODEL_ID = "lane-detection-yolov8/2"


def load_service_env(*, override: bool = False) -> Path:
    load_dotenv(dotenv_path=ENV_PATH, override=override)
    return ENV_PATH


def _env_file_values() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    return {
        key: value
        for key, value in dotenv_values(ENV_PATH).items()
        if isinstance(value, str)
    }


def get_env_value(name: str, default: str | None = None) -> str | None:
    runtime_value = os.getenv(name)
    if isinstance(runtime_value, str) and runtime_value.strip():
        return runtime_value.strip()

    file_value = _env_file_values().get(name)
    if isinstance(file_value, str) and file_value.strip():
        return file_value.strip()

    return default


def mask_secret(secret: str | None) -> str | None:
    if not secret:
        return None

    if len(secret) <= 4:
        return "*" * len(secret)
    if len(secret) <= 8:
        return f"{secret[0]}****{secret[-1]}"
    return f"{secret[:3]}****{secret[-3:]}"


def get_roboflow_config() -> dict[str, str | bool | None]:
    api_key = get_env_value("ROBOFLOW_API_KEY")
    api_url = get_env_value("ROBOFLOW_API_URL", ROBOFLOW_DEFAULT_API_URL)
    return {
        "api_key_exists": bool(api_key),
        "api_key_masked": mask_secret(api_key),
        "helmet_model_id": get_env_value("ROBOFLOW_HELMET_MODEL_ID", ROBOFLOW_HELMET_DEFAULT_MODEL_ID),
        "red_light_model_id": get_env_value("ROBOFLOW_RED_LIGHT_MODEL_ID", ROBOFLOW_RED_LIGHT_DEFAULT_MODEL_ID),
        "white_line_model_id": get_env_value("ROBOFLOW_WHITE_LINE_MODEL_ID", ROBOFLOW_WHITE_LINE_DEFAULT_MODEL_ID),
        "api_url": api_url,
    }


def log_roboflow_config(*, context: str = "startup", target_logger: logging.Logger | None = None) -> None:
    active_logger = target_logger or logger
    config = get_roboflow_config()
    active_logger.info(
        "Roboflow config at %s | api_key_exists=%s | api_key=%s | helmet_model_id=%s | red_light_model_id=%s | white_line_model_id=%s | api_url=%s",
        context,
        config["api_key_exists"],
        config["api_key_masked"] or "<missing>",
        config["helmet_model_id"],
        config["red_light_model_id"],
        config["white_line_model_id"],
        config["api_url"],
    )


load_service_env()

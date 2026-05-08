from __future__ import annotations

import logging

from .env import get_env_value, mask_secret


logger = logging.getLogger(__name__)


def is_production_environment() -> bool:
    return (get_env_value("ENV") or get_env_value("APP_ENV") or "development").lower() == "production"


def get_cors_origins() -> list[str]:
    configured = get_env_value("CORS_ALLOWED_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]

    if is_production_environment():
        raise RuntimeError("CORS_ALLOWED_ORIGINS must be configured in production.")

    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
    ]


def validate_production_environment() -> None:
    if not is_production_environment():
        logger.info("Production config validation skipped for non-production environment.")
        return

    sms_provider = (get_env_value("SMS_PROVIDER") or "").lower()
    required = [
        "SECRET_KEY",
        "DATABASE_URL",
        "REDIS_URL",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_CLIENT_EMAIL",
        "FIREBASE_PRIVATE_KEY",
        "CORS_ALLOWED_ORIGINS",
        "MEDIA_SIGNING_SECRET",
        "PUBLIC_API_BASE_URL",
    ]
    if sms_provider == "twilio":
        required.extend(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"])
    elif sms_provider == "mobitel_msms":
        required.extend(["MOBITEL_MSMS_BASE_URL", "MOBITEL_MSMS_API_KEY"])
    elif sms_provider == "dialog_esms":
        required.extend(["DIALOG_ESMS_BASE_URL", "DIALOG_ESMS_API_KEY"])
    elif sms_provider == "hutch":
        required.extend(["HUTCH_SMS_BASE_URL", "HUTCH_SMS_API_KEY"])
    elif sms_provider == "noop":
        raise RuntimeError("SMS_PROVIDER=noop is only allowed outside production.")
    else:
        required.append("SMS_PROVIDER")

    missing = [name for name in required if not get_env_value(name)]
    if missing:
        raise RuntimeError(f"Missing production configuration: {', '.join(sorted(missing))}")

    logger.info(
        "Production config validated | database=%s | redis=%s | firebase_project=%s | sms_provider=%s",
        mask_secret(get_env_value("DATABASE_URL")),
        mask_secret(get_env_value("REDIS_URL")),
        get_env_value("FIREBASE_PROJECT_ID"),
        sms_provider,
    )

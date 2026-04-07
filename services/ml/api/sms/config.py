from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from ..constants import SmsProviderEnum
from .exceptions import SmsConfigurationError


_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_ENV_PATH)


def _clean_env(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _parse_provider(value: str | None) -> SmsProviderEnum:
    normalized = (_clean_env(value) or SmsProviderEnum.NOOP.value).lower()
    for provider in SmsProviderEnum:
        if provider.value == normalized:
            return provider
    allowed = ", ".join(provider.value for provider in SmsProviderEnum)
    raise SmsConfigurationError(f"Unsupported SMS_PROVIDER '{normalized}'. Expected one of: {allowed}.")


def _parse_timeout(value: str | None) -> float:
    if _clean_env(value) is None:
        return 10.0
    try:
        parsed = float(value)
    except ValueError as exc:
        raise SmsConfigurationError("SMS_REQUEST_TIMEOUT_SECONDS must be a valid number.") from exc
    if parsed <= 0:
        raise SmsConfigurationError("SMS_REQUEST_TIMEOUT_SECONDS must be greater than zero.")
    return parsed


@dataclass(frozen=True, slots=True)
class SmsSettings:
    provider: SmsProviderEnum
    sender_id: str | None
    default_country_code: str | None
    request_timeout_seconds: float
    twilio_account_sid: str | None
    twilio_auth_token: str | None
    twilio_from_number: str | None
    mobitel_msms_base_url: str | None
    mobitel_msms_api_key: str | None
    mobitel_msms_username: str | None
    mobitel_msms_password: str | None
    dialog_esms_base_url: str | None
    dialog_esms_api_key: str | None
    dialog_esms_username: str | None
    dialog_esms_password: str | None
    hutch_sms_base_url: str | None
    hutch_sms_api_key: str | None
    hutch_sms_username: str | None
    hutch_sms_password: str | None

    def require(self, *field_names: str) -> None:
        missing = [field_name for field_name in field_names if not getattr(self, field_name)]
        if missing:
            names = ", ".join(missing)
            raise SmsConfigurationError(
                f"SMS provider '{self.provider.value}' is missing required configuration: {names}."
            )


@lru_cache(maxsize=1)
def get_sms_settings() -> SmsSettings:
    return SmsSettings(
        provider=_parse_provider(os.getenv("SMS_PROVIDER")),
        sender_id=_clean_env(os.getenv("SMS_SENDER_ID")),
        default_country_code=_clean_env(os.getenv("SMS_DEFAULT_COUNTRY_CODE")),
        request_timeout_seconds=_parse_timeout(os.getenv("SMS_REQUEST_TIMEOUT_SECONDS")),
        twilio_account_sid=_clean_env(os.getenv("TWILIO_ACCOUNT_SID")),
        twilio_auth_token=_clean_env(os.getenv("TWILIO_AUTH_TOKEN")),
        twilio_from_number=_clean_env(os.getenv("TWILIO_FROM_NUMBER")),
        mobitel_msms_base_url=_clean_env(os.getenv("MOBITEL_MSMS_BASE_URL")),
        mobitel_msms_api_key=_clean_env(os.getenv("MOBITEL_MSMS_API_KEY")),
        mobitel_msms_username=_clean_env(os.getenv("MOBITEL_MSMS_USERNAME")),
        mobitel_msms_password=_clean_env(os.getenv("MOBITEL_MSMS_PASSWORD")),
        dialog_esms_base_url=_clean_env(os.getenv("DIALOG_ESMS_BASE_URL")),
        dialog_esms_api_key=_clean_env(os.getenv("DIALOG_ESMS_API_KEY")),
        dialog_esms_username=_clean_env(os.getenv("DIALOG_ESMS_USERNAME")),
        dialog_esms_password=_clean_env(os.getenv("DIALOG_ESMS_PASSWORD")),
        hutch_sms_base_url=_clean_env(os.getenv("HUTCH_SMS_BASE_URL")),
        hutch_sms_api_key=_clean_env(os.getenv("HUTCH_SMS_API_KEY")),
        hutch_sms_username=_clean_env(os.getenv("HUTCH_SMS_USERNAME")),
        hutch_sms_password=_clean_env(os.getenv("HUTCH_SMS_PASSWORD")),
    )

from __future__ import annotations

import os
from dataclasses import dataclass, replace

from sqlalchemy.orm import Session

from .. import models
from ..constants import SmsNotificationStatusEnum
from ..tracking import log_sms_send_attempt
from .base import SmsSendRequest, SmsSendResult
from .config import SmsSettings, get_sms_settings
from .exceptions import SmsError, SmsProviderError
from .providers import build_sms_provider


@dataclass(frozen=True, slots=True)
class SmsDispatchOutcome:
    notification: models.SmsNotification
    provider_result: SmsSendResult | None
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.notification.delivery_status == SmsNotificationStatusEnum.SENT


class SmsService:
    def __init__(self, db: Session, *, settings: SmsSettings | None = None) -> None:
        self.db = db
        self.settings = settings or get_sms_settings()
        self.provider = build_sms_provider(self.settings)

    def send(self, request_payload: SmsSendRequest) -> SmsDispatchOutcome:
        prepared_request = replace(
            request_payload,
            phone_number=self._normalize_phone_number(request_payload.phone_number),
            message_body=self._validate_message_body(request_payload.message_body),
        )

        try:
            provider_result = self.provider.send(prepared_request)
        except SmsError as exc:
            notification = self._persist_notification(
                prepared_request,
                delivery_status=SmsNotificationStatusEnum.FAILED,
                provider_message_id=None,
                error_message=str(exc),
                details={
                    "provider_key": self.provider.provider_name.value,
                    "request_metadata": prepared_request.metadata,
                    "exception_type": exc.__class__.__name__,
                },
            )
            return SmsDispatchOutcome(notification=notification, provider_result=None, error=str(exc))

        details = dict(provider_result.details)
        if prepared_request.metadata:
            details["request_metadata"] = prepared_request.metadata

        notification = self._persist_notification(
            prepared_request,
            delivery_status=provider_result.delivery_status,
            provider_message_id=provider_result.provider_message_id,
            error_message=provider_result.error_message,
            details=details,
        )
        return SmsDispatchOutcome(notification=notification, provider_result=provider_result)

    def _persist_notification(
        self,
        request_payload: SmsSendRequest,
        *,
        delivery_status: SmsNotificationStatusEnum,
        provider_message_id: str | None,
        error_message: str | None,
        details: dict,
    ) -> models.SmsNotification:
        # Each dispatch attempt is written once so future integrations have a complete audit trail.
        notification = log_sms_send_attempt(
            self.db,
            citizen_id=request_payload.citizen_id,
            report_id=request_payload.report_id,
            phone_number=request_payload.phone_number,
            template_key=request_payload.template_key,
            provider=self.provider.provider_name.value,
            provider_message_id=provider_message_id,
            message_body=request_payload.message_body,
            delivery_status=delivery_status,
            error_message=error_message,
            details=details,
        )
        self.db.commit()
        self.db.refresh(notification)
        return notification

    def _normalize_phone_number(self, raw_phone_number: str) -> str:
        phone_number = raw_phone_number.strip()
        if not phone_number:
            raise SmsProviderError("Phone number is required for SMS dispatch.")

        if phone_number.startswith("+"):
            normalized = "+" + "".join(char for char in phone_number[1:] if char.isdigit())
            if len(normalized) > 1:
                return normalized
            raise SmsProviderError("Phone number must contain digits after the country code.")

        digits = "".join(char for char in phone_number if char.isdigit())
        if not digits:
            raise SmsProviderError("Phone number must contain digits.")

        if not self.settings.default_country_code:
            raise SmsProviderError(
                "Phone number must be in international format or SMS_DEFAULT_COUNTRY_CODE must be configured."
            )

        country_code = self.settings.default_country_code.strip()
        if not country_code.startswith("+"):
            country_code = f"+{country_code.lstrip('+')}"

        return f"{country_code}{digits.lstrip('0')}"

    def _validate_message_body(self, raw_message_body: str) -> str:
        message_body = raw_message_body.strip()
        if not message_body:
            raise SmsProviderError("SMS message body cannot be empty.")
        return message_body


def get_sms_service(db: Session) -> SmsService:
    return SmsService(db=db)


def dispatch_sms(db: Session, request_payload: SmsSendRequest, *, settings: SmsSettings | None = None) -> SmsDispatchOutcome:
    try:
        service = SmsService(db=db, settings=settings)
    except Exception as exc:
        return _persist_failed_dispatch(
            db,
            request_payload,
            provider=_resolve_provider_label(settings),
            error_message=str(exc),
            exception_type=exc.__class__.__name__,
            details={"stage": "service_initialization"},
        )

    try:
        return service.send(request_payload)
    except Exception as exc:
        return _persist_failed_dispatch(
            db,
            request_payload,
            provider=service.provider.provider_name.value,
            error_message=str(exc),
            exception_type=exc.__class__.__name__,
            details={"stage": "provider_dispatch"},
        )


def _persist_failed_dispatch(
    db: Session,
    request_payload: SmsSendRequest,
    *,
    provider: str | None,
    error_message: str,
    exception_type: str,
    details: dict,
) -> SmsDispatchOutcome:
    failure_details = dict(details)
    if request_payload.metadata:
        failure_details["request_metadata"] = request_payload.metadata
    failure_details["exception_type"] = exception_type

    notification = log_sms_send_attempt(
        db,
        citizen_id=request_payload.citizen_id,
        report_id=request_payload.report_id,
        phone_number=request_payload.phone_number,
        template_key=request_payload.template_key,
        provider=provider,
        provider_message_id=None,
        message_body=request_payload.message_body,
        delivery_status=SmsNotificationStatusEnum.FAILED,
        error_message=error_message,
        details=failure_details,
    )
    db.commit()
    db.refresh(notification)
    return SmsDispatchOutcome(notification=notification, provider_result=None, error=error_message)


def _resolve_provider_label(settings: SmsSettings | None) -> str:
    if settings is not None:
        return settings.provider.value
    return os.getenv("SMS_PROVIDER", "unknown").strip() or "unknown"

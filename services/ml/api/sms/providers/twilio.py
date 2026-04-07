from __future__ import annotations

import base64
import json
from urllib import error, parse, request

from ..base import SmsProvider, SmsSendRequest, SmsSendResult
from ..config import SmsSettings
from ..exceptions import SmsProviderError
from ...constants import SmsNotificationStatusEnum, SmsProviderEnum


def _map_twilio_status(status: str | None) -> SmsNotificationStatusEnum:
    normalized = (status or "").strip().lower()
    if normalized in {"sent", "delivered"}:
        return SmsNotificationStatusEnum.SENT
    if normalized in {"queued", "accepted", "sending", "scheduled"}:
        return SmsNotificationStatusEnum.PENDING
    if normalized in {"failed", "undelivered", "canceled"}:
        return SmsNotificationStatusEnum.FAILED
    return SmsNotificationStatusEnum.PENDING


class TwilioSmsProvider(SmsProvider):
    provider_name = SmsProviderEnum.TWILIO

    def __init__(self, settings: SmsSettings) -> None:
        super().__init__(settings)
        settings.require("twilio_account_sid", "twilio_auth_token", "twilio_from_number")

    def send(self, request_payload: SmsSendRequest) -> SmsSendResult:
        endpoint = (
            "https://api.twilio.com/2010-04-01/Accounts/"
            f"{self.settings.twilio_account_sid}/Messages.json"
        )
        encoded_body = parse.urlencode(
            {
                "To": request_payload.phone_number,
                "From": self.settings.twilio_from_number,
                "Body": request_payload.message_body,
            }
        ).encode("utf-8")
        basic_auth = base64.b64encode(
            f"{self.settings.twilio_account_sid}:{self.settings.twilio_auth_token}".encode("utf-8")
        ).decode("ascii")
        http_request = request.Request(
            endpoint,
            data=encoded_body,
            headers={
                "Authorization": f"Basic {basic_auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=self.settings.request_timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed_error = json.loads(error_body)
                error_message = parsed_error.get("message") or error_body
            except json.JSONDecodeError:
                error_message = error_body or exc.reason
            raise SmsProviderError(
                f"Twilio request failed with HTTP {exc.code}: {error_message}"
            ) from exc
        except error.URLError as exc:
            raise SmsProviderError(f"Twilio request failed: {exc.reason}") from exc

        provider_status = payload.get("status")
        provider_error = payload.get("error_message")
        delivery_status = _map_twilio_status(provider_status)
        if provider_error and delivery_status != SmsNotificationStatusEnum.SENT:
            delivery_status = SmsNotificationStatusEnum.FAILED

        return SmsSendResult(
            delivery_status=delivery_status,
            provider=self.provider_name,
            provider_message_id=payload.get("sid"),
            error_message=provider_error,
            details={
                "provider_status": provider_status,
                "to": payload.get("to"),
                "error_code": payload.get("error_code"),
            },
        )

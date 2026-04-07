from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from ..constants import SmsNotificationStatusEnum, SmsProviderEnum


@dataclass(frozen=True, slots=True)
class SmsSendRequest:
    phone_number: str
    message_body: str
    template_key: str | None = None
    citizen_id: str | None = None
    report_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SmsSendResult:
    delivery_status: SmsNotificationStatusEnum
    provider: SmsProviderEnum
    provider_message_id: str | None = None
    error_message: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


class SmsProvider(ABC):
    provider_name: SmsProviderEnum

    def __init__(self, settings: Any) -> None:
        self.settings = settings

    @abstractmethod
    def send(self, request: SmsSendRequest) -> SmsSendResult:
        raise NotImplementedError

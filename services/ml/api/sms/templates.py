from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .. import models
from ..constants import SmsTemplateKeyEnum


@dataclass(frozen=True, slots=True)
class RenderedSmsTemplate:
    template_key: SmsTemplateKeyEnum
    message_body: str
    metadata: dict[str, Any] = field(default_factory=dict)


def _render_citizen_report_submitted_confirmation(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate:
    status_value = getattr(report.status, "value", str(report.status or ""))
    # Keep the submission confirmation compact enough for a single SMS segment when possible.
    message_body = (
        f"LexVision: Your evidence report {report.tracking_id} was submitted successfully. "
        "We will review it and notify you when the status changes."
    )
    return RenderedSmsTemplate(
        template_key=SmsTemplateKeyEnum.CITIZEN_REPORT_SUBMITTED_CONFIRMATION,
        message_body=message_body,
        metadata={
            "tracking_id": report.tracking_id,
            "report_id": report.id,
            "citizen_id": citizen.id,
            "violation_type": report.violation_type,
            "status": status_value,
        },
    )


_TEMPLATE_REGISTRY: dict[SmsTemplateKeyEnum, Callable[..., RenderedSmsTemplate]] = {
    SmsTemplateKeyEnum.CITIZEN_REPORT_SUBMITTED_CONFIRMATION: _render_citizen_report_submitted_confirmation,
}


def render_sms_template(template_key: SmsTemplateKeyEnum, **context: Any) -> RenderedSmsTemplate:
    renderer = _TEMPLATE_REGISTRY.get(template_key)
    if renderer is None:
        raise ValueError(f"No SMS template registered for '{template_key.value}'.")
    return renderer(**context)

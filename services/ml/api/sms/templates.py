from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .. import models
from ..constants import ReportStatusEnum, SmsTemplateKeyEnum


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


def _render_citizen_report_under_review(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate:
    return RenderedSmsTemplate(
        template_key=SmsTemplateKeyEnum.CITIZEN_REPORT_UNDER_REVIEW,
        message_body=(
            f"LexVision: Your evidence report {report.tracking_id} is now under review by our officers."
        ),
        metadata={
            "tracking_id": report.tracking_id,
            "report_id": report.id,
            "citizen_id": citizen.id,
            "status": ReportStatusEnum.UNDER_REVIEW.value,
        },
    )


def _render_citizen_report_accepted(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate:
    return RenderedSmsTemplate(
        template_key=SmsTemplateKeyEnum.CITIZEN_REPORT_ACCEPTED,
        message_body=(
            f"LexVision: Your evidence report {report.tracking_id} was accepted after review."
        ),
        metadata={
            "tracking_id": report.tracking_id,
            "report_id": report.id,
            "citizen_id": citizen.id,
            "status": ReportStatusEnum.VALIDATED.value,
        },
    )


def _render_citizen_report_rejected(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate:
    return RenderedSmsTemplate(
        template_key=SmsTemplateKeyEnum.CITIZEN_REPORT_REJECTED,
        message_body=(
            f"LexVision: Your evidence report {report.tracking_id} was rejected after review."
        ),
        metadata={
            "tracking_id": report.tracking_id,
            "report_id": report.id,
            "citizen_id": citizen.id,
            "status": ReportStatusEnum.REJECTED.value,
        },
    )


def _render_citizen_report_closed(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate:
    return RenderedSmsTemplate(
        template_key=SmsTemplateKeyEnum.CITIZEN_REPORT_CLOSED,
        message_body=(
            f"LexVision: Your evidence report {report.tracking_id} has been closed. Thank you for your submission."
        ),
        metadata={
            "tracking_id": report.tracking_id,
            "report_id": report.id,
            "citizen_id": citizen.id,
            "status": ReportStatusEnum.CLOSED.value,
        },
    )


_TEMPLATE_REGISTRY: dict[SmsTemplateKeyEnum, Callable[..., RenderedSmsTemplate]] = {
    SmsTemplateKeyEnum.CITIZEN_REPORT_SUBMITTED_CONFIRMATION: _render_citizen_report_submitted_confirmation,
    SmsTemplateKeyEnum.CITIZEN_REPORT_UNDER_REVIEW: _render_citizen_report_under_review,
    SmsTemplateKeyEnum.CITIZEN_REPORT_ACCEPTED: _render_citizen_report_accepted,
    SmsTemplateKeyEnum.CITIZEN_REPORT_REJECTED: _render_citizen_report_rejected,
    SmsTemplateKeyEnum.CITIZEN_REPORT_CLOSED: _render_citizen_report_closed,
}


STATUS_NOTIFICATION_TEMPLATES: dict[ReportStatusEnum, SmsTemplateKeyEnum] = {
    ReportStatusEnum.UNDER_REVIEW: SmsTemplateKeyEnum.CITIZEN_REPORT_UNDER_REVIEW,
    ReportStatusEnum.VALIDATED: SmsTemplateKeyEnum.CITIZEN_REPORT_ACCEPTED,
    ReportStatusEnum.REJECTED: SmsTemplateKeyEnum.CITIZEN_REPORT_REJECTED,
    ReportStatusEnum.CLOSED: SmsTemplateKeyEnum.CITIZEN_REPORT_CLOSED,
}


def render_sms_template(template_key: SmsTemplateKeyEnum, **context: Any) -> RenderedSmsTemplate:
    renderer = _TEMPLATE_REGISTRY.get(template_key)
    if renderer is None:
        raise ValueError(f"No SMS template registered for '{template_key.value}'.")
    return renderer(**context)


def render_status_change_sms_template(
    *,
    report: models.EvidenceReport,
    citizen: models.Citizen,
) -> RenderedSmsTemplate | None:
    template_key = STATUS_NOTIFICATION_TEMPLATES.get(report.status)
    if template_key is None:
        return None
    return render_sms_template(template_key, report=report, citizen=citizen)

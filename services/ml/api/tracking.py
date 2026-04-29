from sqlalchemy.orm import Session

from .constants import (
    REPORT_STATUS_TRANSITIONS,
    TICKET_STATUS_TRANSITIONS,
    ReportStatusEnum,
    SmsNotificationStatusEnum,
    StatusChangeSourceEnum,
    TicketStatusEnum,
)
from . import models


def apply_evidence_report_status(
    report: models.EvidenceReport,
    new_status: ReportStatusEnum,
    *,
    notes: str | None = None,
    source: StatusChangeSourceEnum = StatusChangeSourceEnum.SYSTEM,
    changed_by_user_id: str | None = None,
    changed_by_citizen_id: str | None = None,
    details: dict | None = None,
) -> models.EvidenceReport:
    report.set_status(
        new_status,
        notes=notes,
        source=source,
        changed_by_user_id=changed_by_user_id,
        changed_by_citizen_id=changed_by_citizen_id,
        details=details,
    )
    return report


def is_valid_report_status_transition(
    current_status: ReportStatusEnum | None,
    next_status: ReportStatusEnum,
) -> bool:
    return next_status in REPORT_STATUS_TRANSITIONS.get(current_status, [])


def log_sms_send_attempt(
    db: Session,
    *,
    phone_number: str,
    delivery_status: SmsNotificationStatusEnum,
    citizen_id: str | None = None,
    report_id: str | None = None,
    template_key: str | None = None,
    provider: str | None = None,
    provider_message_id: str | None = None,
    message_body: str | None = None,
    error_message: str | None = None,
    details: dict | None = None,
) -> models.SmsNotification:
    sms_log = models.SmsNotification(
        citizen_id=citizen_id,
        report_id=report_id,
        phone_number=phone_number,
        template_key=template_key,
        provider=provider,
        provider_message_id=provider_message_id,
        message_body=message_body,
        delivery_status=delivery_status,
        error_message=error_message,
        details=details or {},
    )
    db.add(sms_log)
    return sms_log


# ---------------------------------------------------------------------------
# Ticket lifecycle helpers
# ---------------------------------------------------------------------------


def is_valid_ticket_status_transition(
    current_status: TicketStatusEnum | None,
    next_status: TicketStatusEnum,
) -> bool:
    """Return True if *next_status* is a valid successor of *current_status*.

    Uses the TICKET_STATUS_TRANSITIONS map defined in constants.py.
    """
    return next_status in TICKET_STATUS_TRANSITIONS.get(current_status, [])


def apply_ticket_status(
    ticket: models.TrafficTicket,
    new_status: TicketStatusEnum,
    *,
    notes: str | None = None,
    source: StatusChangeSourceEnum = StatusChangeSourceEnum.SYSTEM,
    changed_by_user_id: str | None = None,
    details: dict | None = None,
) -> models.TrafficTicket:
    """Set *new_status* on *ticket* with full audit context.

    This delegates to ``TrafficTicket.set_status()`` which stores the
    context dict for the SQLAlchemy event listener to pick up.
    """
    ticket.set_status(
        new_status,
        notes=notes,
        source=source,
        changed_by_user_id=changed_by_user_id,
        details=details,
    )
    return ticket


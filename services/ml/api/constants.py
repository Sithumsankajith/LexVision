import enum


class RoleEnum(str, enum.Enum):
    CITIZEN = "CITIZEN"
    POLICE = "POLICE"
    ADMIN = "ADMIN"


class ReportStatusEnum(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    AI_PROCESSING = "AI_PROCESSING"
    UNDER_REVIEW = "UNDER_REVIEW"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    CLOSED = "CLOSED"


# Backwards-compatible alias for existing imports.
StatusEnum = ReportStatusEnum


REPORT_STATUS_TRANSITIONS = {
    ReportStatusEnum.SUBMITTED: [ReportStatusEnum.AI_PROCESSING, ReportStatusEnum.UNDER_REVIEW],
    ReportStatusEnum.AI_PROCESSING: [ReportStatusEnum.UNDER_REVIEW],
    ReportStatusEnum.UNDER_REVIEW: [ReportStatusEnum.VALIDATED, ReportStatusEnum.REJECTED],
    ReportStatusEnum.VALIDATED: [ReportStatusEnum.CLOSED],
    ReportStatusEnum.REJECTED: [ReportStatusEnum.UNDER_REVIEW, ReportStatusEnum.CLOSED],
    ReportStatusEnum.CLOSED: [],
}


class TicketStatusEnum(str, enum.Enum):
    """Enforcement ticket lifecycle statuses.

    Lifecycle graph:
        DRAFT ──→ ISSUED ──→ NOTIFIED ──→ PAID ──→ CLOSED
                    │            │           │
                    │            ├──→ OVERDUE ┤
                    │            │            ├──→ PAID ──→ CLOSED
                    │            │            └──→ CANCELLED ──→ CLOSED
                    │            └──→ APPEALED ──→ CANCELLED ──→ CLOSED
                    │                         └──→ ISSUED (re‑affirmed)
                    └──→ CANCELLED ──→ CLOSED
        DRAFT ──→ CANCELLED ──→ CLOSED
    """

    # Ticket has been drafted but not yet formally issued.
    DRAFT = "DRAFT"
    # Ticket has been formally issued by a validated police officer.
    ISSUED = "ISSUED"
    # Offender has been notified of the ticket (via SMS / mail / in-person).
    NOTIFIED = "NOTIFIED"
    # Fine has been paid in full.
    PAID = "PAID"
    # Payment deadline has passed without payment.
    OVERDUE = "OVERDUE"
    # Offender has filed a formal appeal against the ticket.
    APPEALED = "APPEALED"
    # Ticket has been cancelled (by officer, admin, or successful appeal).
    CANCELLED = "CANCELLED"
    # Ticket lifecycle is complete — terminal state, no further transitions.
    CLOSED = "CLOSED"


# Maps each ticket status to the list of statuses it may transition to.
# Every entry is annotated with the rationale for the allowed transition.
TICKET_STATUS_TRANSITIONS: dict[TicketStatusEnum, list[TicketStatusEnum]] = {
    # DRAFT → ISSUED: officer finalises and issues the ticket after validation.
    # DRAFT → CANCELLED: officer discards the draft before issuance.
    TicketStatusEnum.DRAFT: [TicketStatusEnum.ISSUED, TicketStatusEnum.CANCELLED],

    # ISSUED → NOTIFIED: offender has been informed of the ticket.
    # ISSUED → PAID: offender pays immediately without a formal notification step.
    # ISSUED → APPEALED: offender files an appeal before notification completes.
    # ISSUED → CANCELLED: officer/admin cancels a just-issued ticket.
    TicketStatusEnum.ISSUED: [
        TicketStatusEnum.NOTIFIED,
        TicketStatusEnum.PAID,
        TicketStatusEnum.APPEALED,
        TicketStatusEnum.CANCELLED,
    ],

    # NOTIFIED → PAID: offender pays the fine.
    # NOTIFIED → OVERDUE: payment deadline passes without payment.
    # NOTIFIED → APPEALED: offender appeals the ticket.
    # NOTIFIED → CANCELLED: officer/admin cancels the ticket after notification.
    TicketStatusEnum.NOTIFIED: [
        TicketStatusEnum.PAID,
        TicketStatusEnum.OVERDUE,
        TicketStatusEnum.APPEALED,
        TicketStatusEnum.CANCELLED,
    ],

    # PAID → CLOSED: payment received; ticket lifecycle ends.
    TicketStatusEnum.PAID: [TicketStatusEnum.CLOSED],

    # OVERDUE → PAID: late payment is still accepted.
    # OVERDUE → APPEALED: offender appeals while overdue.
    # OVERDUE → CANCELLED: officer/admin cancels an overdue ticket.
    TicketStatusEnum.OVERDUE: [
        TicketStatusEnum.PAID,
        TicketStatusEnum.APPEALED,
        TicketStatusEnum.CANCELLED,
    ],

    # APPEALED → CANCELLED: appeal is upheld; ticket is voided.
    # APPEALED → ISSUED: appeal is denied; ticket is re-affirmed and re-issued.
    TicketStatusEnum.APPEALED: [TicketStatusEnum.CANCELLED, TicketStatusEnum.ISSUED],

    # CANCELLED → CLOSED: administrative closure after cancellation.
    TicketStatusEnum.CANCELLED: [TicketStatusEnum.CLOSED],

    # CLOSED: terminal state — no further transitions allowed.
    TicketStatusEnum.CLOSED: [],
}


class StatusChangeSourceEnum(str, enum.Enum):
    SYSTEM = "SYSTEM"
    CITIZEN = "CITIZEN"
    POLICE = "POLICE"
    ADMIN = "ADMIN"
    ML_WORKER = "ML_WORKER"


class SmsNotificationStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class SmsProviderEnum(str, enum.Enum):
    NOOP = "noop"
    MOBITEL_MSMS = "mobitel_msms"
    DIALOG_ESMS = "dialog_esms"
    HUTCH = "hutch"
    TWILIO = "twilio"


class SmsTemplateKeyEnum(str, enum.Enum):
    CITIZEN_REPORT_SUBMITTED_CONFIRMATION = "citizen_report_submitted_confirmation"
    CITIZEN_REPORT_UNDER_REVIEW = "citizen_report_under_review"
    CITIZEN_REPORT_ACCEPTED = "citizen_report_accepted"
    CITIZEN_REPORT_REJECTED = "citizen_report_rejected"
    CITIZEN_REPORT_CLOSED = "citizen_report_closed"

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

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


# Backwards-compatible alias for existing imports.
StatusEnum = ReportStatusEnum


REPORT_STATUS_TRANSITIONS = {
    ReportStatusEnum.SUBMITTED: [ReportStatusEnum.AI_PROCESSING, ReportStatusEnum.UNDER_REVIEW],
    ReportStatusEnum.AI_PROCESSING: [ReportStatusEnum.UNDER_REVIEW],
    ReportStatusEnum.UNDER_REVIEW: [ReportStatusEnum.VALIDATED, ReportStatusEnum.REJECTED],
    ReportStatusEnum.VALIDATED: [],
    ReportStatusEnum.REJECTED: [ReportStatusEnum.UNDER_REVIEW],
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

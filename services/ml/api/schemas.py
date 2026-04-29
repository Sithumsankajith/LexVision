from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime
from .models import RoleEnum, StatusEnum
from .constants import StatusChangeSourceEnum

# --- User Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.CITIZEN

class UserResponseAdmin(BaseModel):
    id: str
    email: str
    role: RoleEnum
    reward_points: float
    created_at: datetime
    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: str
    email: str
    role: RoleEnum
    reward_points: float
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None


class FirebaseCitizenAuthRequest(BaseModel):
    id_token: str


class CitizenResponse(BaseModel):
    id: str
    firebase_uid: str
    phone_number: str
    verified_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class CitizenAuthResponse(BaseModel):
    access_token: str
    token_type: str
    citizen: CitizenResponse


class CitizenTokenData(BaseModel):
    citizen_id: Optional[str] = None
    token_scope: Optional[str] = None


class CitizenOtpReadinessResponse(BaseModel):
    backend_configured: bool
    firebase_project_id: Optional[str] = None
    missing_backend_env: List[str] = []
    requirements: List[str] = []


class CitizenEvidenceFileCreate(BaseModel):
    type: str
    url: str
    name: str
    size: float
    mime_type: Optional[str] = None


class CitizenEvidenceFileResponse(BaseModel):
    id: str
    file_type: str
    storage_url: str
    original_name: str
    mime_type: Optional[str]
    size_bytes: float
    created_at: datetime

    class Config:
        from_attributes = True


class CitizenSummaryResponse(BaseModel):
    id: str
    phone_number: str

    class Config:
        from_attributes = True


class CitizenEvidenceReportCreate(BaseModel):
    violation_type: str
    incident_at: datetime
    location_lat: float
    location_lng: float
    location_address: str
    location_city: str
    description: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    evidence: List[CitizenEvidenceFileCreate]


class CitizenEvidenceReportResponse(BaseModel):
    id: str
    tracking_id: str
    citizen_id: str
    violation_type: str
    incident_at: datetime
    location_lat: float
    location_lng: float
    location_address: Optional[str]
    location_city: Optional[str]
    description: Optional[str]
    vehicle_plate: Optional[str]
    vehicle_type: Optional[str]
    status: StatusEnum
    created_at: datetime
    updated_at: datetime
    files: List[CitizenEvidenceFileResponse] = []

    class Config:
        from_attributes = True


class StaffEvidenceReportResponse(CitizenEvidenceReportResponse):
    citizen: Optional[CitizenSummaryResponse] = None


class CitizenReportSummaryResponse(BaseModel):
    id: str
    tracking_id: str
    violation_type: str
    status: StatusEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CitizenStatusHistoryResponse(BaseModel):
    id: str
    previous_status: Optional[StatusEnum] = None
    new_status: StatusEnum
    change_source: StatusChangeSourceEnum
    notes: Optional[str] = None
    changed_at: datetime

    class Config:
        from_attributes = True


class CitizenReportDetailResponse(CitizenEvidenceReportResponse):
    status_history: List[CitizenStatusHistoryResponse] = []

# --- Evidence Schema ---
class EvidenceSchema(BaseModel):
    id: Optional[str] = None
    type: str
    url: str
    name: str
    size: float
    class Config:
        from_attributes = True

# --- Inference Log Schema (must be before ReportResponse) ---
class InferenceLogResponse(BaseModel):
    id: str
    report_id: str
    model_version: str
    bbox_coordinates: Any
    confidence: float
    ocr_text: Optional[str]
    ocr_confidence: Optional[float]
    inference_latency: float
    timestamp: datetime
    class Config:
        from_attributes = True

# --- Report Schemas ---
class ReportCreate(BaseModel):
    violation_type: str
    datetime: datetime
    location_lat: float
    location_lng: float
    location_address: str
    location_city: str
    evidence: List[EvidenceSchema]

class ReportResponse(BaseModel):
    id: str
    tracking_id: str
    user_id: str
    claimed_violation_type: Optional[str] = None
    inferred_violation_type: Optional[str] = None
    violation_type: Optional[str] = None
    datetime: datetime
    location_lat: float
    location_lng: float
    location_address: str
    location_city: str
    status: StatusEnum
    created_at: datetime
    updated_at: datetime
    evidence: List[EvidenceSchema] = []
    inference_log: Optional[InferenceLogResponse] = None
    class Config:
        from_attributes = True

class ReportStatusUpdate(BaseModel):
    status: StatusEnum
    notes: Optional[str] = None

# --- Fine Rule Schemas ---
class FineRuleBase(BaseModel):
    violation_type: str
    penal_code: str
    fine_amount: float
    currency: Optional[str] = "LKR"
    description: Optional[str] = None
    severity: Optional[str] = None
    active: Optional[bool] = True

class FineRuleCreate(FineRuleBase):
    pass

class FineRuleUpdate(BaseModel):
    penal_code: Optional[str] = None
    fine_amount: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    active: Optional[bool] = None

class FineRuleResponse(FineRuleBase):
    id: str
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Ticket Schemas ---

class TicketCreate(BaseModel):
    """Create a new enforcement ticket.

    Exactly one of ``report_id`` or ``evidence_report_id`` must be provided.
    The referenced report must be in VALIDATED status.
    If ``penal_code`` and ``fine_amount`` are provided, ``fine_override_reason`` must also be provided.
    Otherwise, the default fine rule for the violation type will be used.
    """

    report_id: Optional[str] = None
    evidence_report_id: Optional[str] = None
    penal_code: Optional[str] = None
    fine_amount: Optional[float] = None
    fine_override_reason: Optional[str] = None
    violation_type: Optional[str] = None
    vehicle_plate: Optional[str] = None
    offender_name: Optional[str] = None
    offender_contact: Optional[str] = None
    notes: Optional[str] = None
    # If True, the ticket is created directly in ISSUED status (skipping DRAFT).
    issue_immediately: bool = True


class TicketStatusUpdate(BaseModel):
    """Advance the ticket through its lifecycle.

    The ``status`` field must be a valid next state according to
    TICKET_STATUS_TRANSITIONS. Depending on the target status,
    additional fields may be required:
    - PAID: ``payment_reference`` should be provided.
    - APPEALED: ``appeal_reason`` should be provided.
    - CANCELLED: ``cancelled_reason`` should be provided.
    """

    status: str  # TicketStatusEnum value — validated at the route level
    notes: Optional[str] = None
    payment_reference: Optional[str] = None
    appeal_reason: Optional[str] = None
    cancelled_reason: Optional[str] = None


class TicketStatusHistoryResponse(BaseModel):
    """Single audit entry for a ticket status transition."""

    id: str
    previous_status: Optional[str] = None
    new_status: str
    change_source: str
    notes: Optional[str] = None
    details: Optional[dict] = None
    changed_at: datetime

    class Config:
        from_attributes = True


class TicketResponse(BaseModel):
    """Full ticket representation including lifecycle metadata."""

    id: str
    ticket_number: str
    report_id: Optional[str] = None
    evidence_report_id: Optional[str] = None
    officer_id: str
    status: str
    fine_rule_id: Optional[str] = None
    fine_rule_version: Optional[int] = None
    penal_code: str
    fine_amount: float
    fine_override_reason: Optional[str] = None
    violation_type: Optional[str] = None
    vehicle_plate: Optional[str] = None
    offender_name: Optional[str] = None
    offender_contact: Optional[str] = None
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    payment_reference: Optional[str] = None
    appeal_reason: Optional[str] = None
    appealed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancelled_reason: Optional[str] = None
    notes: Optional[str] = None
    issued_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    status_history: List[TicketStatusHistoryResponse] = []

    class Config:
        from_attributes = True


class TicketSummaryResponse(BaseModel):
    """Lightweight ticket representation for list views."""

    id: str
    ticket_number: str
    report_id: Optional[str] = None
    evidence_report_id: Optional[str] = None
    status: str
    penal_code: str
    fine_amount: float
    violation_type: Optional[str] = None
    vehicle_plate: Optional[str] = None
    issued_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Reward Schemas ---
class RewardResponse(BaseModel):
    id: str
    title: str
    description: str
    points_cost: float
    image_url: Optional[str]
    class Config:
        from_attributes = True

class UserRewardResponse(BaseModel):
    id: str
    reward: RewardResponse
    claimed_at: datetime
    class Config:
        from_attributes = True

class ProfileResponse(BaseModel):
    user: UserResponse
    reports_count: int
    validated_reports_count: int
    claimed_rewards: List[UserRewardResponse]

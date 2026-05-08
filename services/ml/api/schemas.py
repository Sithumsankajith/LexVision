from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Any
from datetime import datetime, timezone
from .models import RoleEnum, StatusEnum
from .constants import StatusChangeSourceEnum
from .locations import is_within_sri_lanka_bounds, normalize_district
from .violation_types import canonical_or_original_violation_type, is_supported_claimed_violation_type

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
    model_config = ConfigDict(from_attributes=True)

class UserResponse(BaseModel):
    id: str
    email: str
    role: RoleEnum
    reward_points: float
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None


class FirebaseCitizenAuthRequest(BaseModel):
    id_token: str


class FirebasePhoneLoginRequest(BaseModel):
    firebase_id_token: str
    phone_number: str


class DemoCitizenAuthRequest(BaseModel):
    phone_number: str


class CitizenResponse(BaseModel):
    id: str
    firebase_uid: str
    phone_number: str
    verified_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenSessionUserResponse(BaseModel):
    id: str
    role: RoleEnum = RoleEnum.CITIZEN
    phone_number: str


class CitizenAuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: CitizenSessionUserResponse
    citizen: Optional[CitizenResponse] = None


class CitizenTokenData(BaseModel):
    citizen_id: Optional[str] = None
    token_scope: Optional[str] = None


class CitizenOtpReadinessResponse(BaseModel):
    backend_configured: bool
    admin_configured: bool = False
    dev_mode_enabled: bool = False
    verification_mode: str = "unconfigured"
    firebase_project_id: Optional[str] = None
    missing_backend_env: List[str] = []
    requirements: List[str] = []


class CitizenEvidenceFileCreate(BaseModel):
    type: str
    url: str
    name: str
    size: float
    mime_type: Optional[str] = None
    storage_backend: Optional[str] = None
    storage_path: Optional[str] = None
    checksum_sha256: Optional[str] = None
    access_metadata: Optional[dict] = None

    @field_validator("type")
    def validate_file_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"image", "video"}:
            raise ValueError("Evidence type must be image or video")
        return normalized

    @field_validator("url")
    def validate_storage_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Evidence URL is required")
        if not (
            cleaned.startswith("data:image/")
            or cleaned.startswith("data:video/")
            or cleaned.startswith("local://")
            or cleaned.startswith("https://")
            or cleaned.startswith("http://localhost")
            or cleaned.startswith("/")
        ):
            raise ValueError("Evidence URL must be a data URI, local storage URL, HTTPS URL, localhost URL, or server file path")
        return cleaned

    @field_validator("size")
    def validate_file_size(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Evidence file size must be greater than zero")
        if value > 25 * 1024 * 1024:
            raise ValueError("Evidence file size must be 25 MB or less")
        return value


class CitizenEvidenceFileResponse(BaseModel):
    id: str
    file_type: str
    storage_url: str
    original_name: str
    mime_type: Optional[str]
    size_bytes: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenSummaryResponse(BaseModel):
    id: str
    phone_number: str

    model_config = ConfigDict(from_attributes=True)


class CitizenEvidenceReportCreate(BaseModel):
    violation_type: str
    incident_at: datetime
    location_lat: float = Field(ge=-90, le=90)
    location_lng: float = Field(ge=-180, le=180)
    location_address: str
    location_city: str
    location_district: str
    description: Optional[str] = None
    custom_violation_description: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    evidence: List[CitizenEvidenceFileCreate] = Field(min_length=1, max_length=5)

    @field_validator("violation_type")
    def validate_violation_type(cls, value: str) -> str:
        normalized = canonical_or_original_violation_type(value)
        if not is_supported_claimed_violation_type(normalized):
            raise ValueError("violation_type must be one of: helmet, red_light, white_line, other")
        return normalized or value

    @field_validator("incident_at")
    def validate_incident_at(cls, value: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        comparable_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if comparable_value > now:
            raise ValueError("incident_at cannot be in the future")
        return value

    @field_validator("location_address", "location_city")
    def validate_required_location_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Location address and city are required")
        return cleaned

    @field_validator("location_district")
    def validate_location_district(cls, value: str) -> str:
        district = normalize_district(value)
        if district is None:
            raise ValueError("location_district must be one of the 25 Sri Lankan districts")
        return district

    @field_validator("custom_violation_description")
    def clean_custom_violation_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_location_and_custom_violation(self):
        if not is_within_sri_lanka_bounds(self.location_lat, self.location_lng):
            raise ValueError("location_lat and location_lng must be within Sri Lanka")
        if self.violation_type == "other" and not self.custom_violation_description:
            raise ValueError("custom_violation_description is required when violation_type is other")
        return self


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
    location_district: Optional[str] = None
    description: Optional[str]
    custom_violation_description: Optional[str] = None
    manual_review_required: bool = False
    vehicle_plate: Optional[str]
    vehicle_type: Optional[str]
    status: StatusEnum
    created_at: datetime
    updated_at: datetime
    files: List[CitizenEvidenceFileResponse] = []
    inference_log: Optional["InferenceLogResponse"] = None
    ai_summary: Optional["AISummaryResponse"] = None

    model_config = ConfigDict(from_attributes=True)


class StaffEvidenceReportResponse(CitizenEvidenceReportResponse):
    citizen: Optional[CitizenSummaryResponse] = None


class CitizenReportSummaryResponse(BaseModel):
    id: str
    tracking_id: str
    violation_type: str
    location_district: Optional[str] = None
    status: StatusEnum
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenStatusHistoryResponse(BaseModel):
    id: str
    previous_status: Optional[StatusEnum] = None
    new_status: StatusEnum
    change_source: StatusChangeSourceEnum
    notes: Optional[str] = None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitizenReportDetailResponse(CitizenEvidenceReportResponse):
    status_history: List[CitizenStatusHistoryResponse] = []

# --- Evidence Schema ---
class EvidenceSchema(BaseModel):
    id: Optional[str] = None
    type: str
    url: str
    name: str
    size: float
    model_config = ConfigDict(from_attributes=True)

# --- Inference Log Schema (must be before ReportResponse) ---
class InferenceLogResponse(BaseModel):
    id: str
    report_id: Optional[str] = None
    evidence_report_id: Optional[str] = None
    model_version: str
    bbox_coordinates: Any
    confidence: float
    ocr_text: Optional[str]
    ocr_confidence: Optional[float]
    inference_latency: float
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class AIDetectionBBoxResponse(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    x1: Optional[float] = None
    y1: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None


class AIDetectionResponse(BaseModel):
    class_name: str = Field(alias="class")
    normalized_class: Optional[str] = None
    confidence: float = 0.0
    confidence_level: Optional[str] = None
    bbox: Optional[AIDetectionBBoxResponse] = None
    bbox_xyxy: Optional[AIDetectionBBoxResponse] = None


class AISummaryResponse(BaseModel):
    violation_family: Optional[str] = None
    provider: Optional[str] = None
    model_id: Optional[str] = None
    claimed_violation_type: Optional[str] = None
    inferred_violation_type: Optional[str] = None
    final_violation_type: Optional[str] = None
    has_violation: bool = False
    has_helmet_violation: bool = False
    confidence: float = 0.0
    confidence_level: Optional[str] = None
    manual_review_required: bool = False
    review_reason: Optional[str] = None
    detected_classes: List[str] = []
    detections: List[AIDetectionResponse] = []
    error: Optional[str] = None
    status: Optional[str] = None
    processed_at: Optional[datetime] = None

# --- Report Schemas ---
class ReportCreate(BaseModel):
    violation_type: str
    datetime: datetime
    location_lat: float = Field(ge=-90, le=90)
    location_lng: float = Field(ge=-180, le=180)
    location_address: str
    location_city: str
    location_district: str
    custom_violation_description: Optional[str] = None
    evidence: List[EvidenceSchema] = Field(min_length=1, max_length=5)

    @field_validator("violation_type")
    def validate_violation_type(cls, value: str) -> str:
        normalized = canonical_or_original_violation_type(value)
        if not is_supported_claimed_violation_type(normalized):
            raise ValueError("violation_type must be one of: helmet, red_light, white_line, other")
        return normalized or value

    @field_validator("datetime")
    def validate_report_datetime(cls, value: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        comparable_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        if comparable_value > now:
            raise ValueError("datetime cannot be in the future")
        return value

    @field_validator("location_address", "location_city")
    def validate_required_report_location_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Location address and city are required")
        return cleaned

    @field_validator("location_district")
    def validate_report_location_district(cls, value: str) -> str:
        district = normalize_district(value)
        if district is None:
            raise ValueError("location_district must be one of the 25 Sri Lankan districts")
        return district

    @field_validator("custom_violation_description")
    def clean_report_custom_violation_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_report_location_and_custom_violation(self):
        if not is_within_sri_lanka_bounds(self.location_lat, self.location_lng):
            raise ValueError("location_lat and location_lng must be within Sri Lanka")
        if self.violation_type == "other" and not self.custom_violation_description:
            raise ValueError("custom_violation_description is required when violation_type is other")
        return self

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
    location_district: Optional[str] = None
    custom_violation_description: Optional[str] = None
    manual_review_required: bool = False
    status: StatusEnum
    created_at: datetime
    updated_at: datetime
    evidence: List[EvidenceSchema] = []
    inference_log: Optional[InferenceLogResponse] = None
    ai_summary: Optional[AISummaryResponse] = None
    model_config = ConfigDict(from_attributes=True)

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

    @field_validator("violation_type")
    def normalize_violation_type(cls, value: str) -> str:
        return canonical_or_original_violation_type(value) or value

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

    model_config = ConfigDict(from_attributes=True)

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

    @field_validator("violation_type")
    def normalize_violation_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return canonical_or_original_violation_type(value) or value
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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# --- Reward Schemas ---
class RewardResponse(BaseModel):
    id: str
    title: str
    description: str
    points_cost: float
    image_url: Optional[str]
    model_config = ConfigDict(from_attributes=True)

class UserRewardResponse(BaseModel):
    id: str
    reward: RewardResponse
    claimed_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ProfileResponse(BaseModel):
    user: UserResponse
    reports_count: int
    validated_reports_count: int
    claimed_rewards: List[UserRewardResponse]


# --- Notification Schemas ---

class NotificationResponse(BaseModel):
    id: str
    recipient_role: str
    title: str
    message: str
    notification_type: str
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    priority: str
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
    extra_data: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int

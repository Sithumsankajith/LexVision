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
    violation_type: str
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

# --- Ticket Schemas ---
class TicketCreate(BaseModel):
    report_id: str
    penal_code: str
    fine_amount: float

class TicketResponse(BaseModel):
    id: str
    report_id: str
    officer_id: str
    issued_at: datetime
    created_at: datetime
    penal_code: str
    fine_amount: float
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

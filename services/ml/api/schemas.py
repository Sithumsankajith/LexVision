from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime
from .models import RoleEnum, StatusEnum

# --- User Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.CITIZEN

class UserResponse(BaseModel):
    id: str
    email: str
    role: RoleEnum
    reward_points: float
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- Report Schemas ---
class EvidenceSchema(BaseModel):
    id: Optional[str] = None
    type: str
    url: str
    name: str
    size: float
    class Config:
        from_attributes = True

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

# --- Inference Log Schemas ---
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

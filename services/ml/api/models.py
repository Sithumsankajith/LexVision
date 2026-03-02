import uuid
import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, JSON, Enum
from sqlalchemy.orm import relationship
from .database import Base
import enum

class RoleEnum(str, enum.Enum):
    CITIZEN = "CITIZEN"
    POLICE = "POLICE"
    ADMIN = "ADMIN"

class StatusEnum(str, enum.Enum):
    SUBMITTED = "SUBMITTED"
    AI_PROCESSING = "AI_PROCESSING"
    UNDER_REVIEW = "UNDER_REVIEW"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(RoleEnum), default=RoleEnum.CITIZEN)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Report(Base):
    __tablename__ = "reports"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tracking_id = Column(String, unique=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    violation_type = Column(String)
    datetime = Column(DateTime, index=True) # timestamp index
    location_lat = Column(Float)
    location_lng = Column(Float)
    location_address = Column(String)
    location_city = Column(String)
    status = Column(Enum(StatusEnum), default=StatusEnum.SUBMITTED, index=True) # status index
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User")
    evidence = relationship("Evidence", back_populates="report")
    inference_log = relationship("InferenceLog", back_populates="report", uselist=False)
    ticket = relationship("TrafficTicket", back_populates="report", uselist=False)

class Evidence(Base):
    __tablename__ = "evidence"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("reports.id"), index=True)
    type = Column(String)
    url = Column(String)
    name = Column(String)
    size = Column(Float)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    report = relationship("Report", back_populates="evidence")

class InferenceLog(Base):
    __tablename__ = "inference_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("reports.id"), unique=True, index=True)
    model_version = Column(String)
    bbox_coordinates = Column(JSON)
    confidence = Column(Float)
    ocr_text = Column(String, index=True) # plate_text index
    ocr_confidence = Column(Float)
    inference_latency = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    report = relationship("Report", back_populates="inference_log")

class TrafficTicket(Base):
    __tablename__ = "traffic_tickets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("reports.id"), unique=True)
    officer_id = Column(String, ForeignKey("users.id"), index=True) # officer_id index
    issued_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow) # created_at timestamp
    penal_code = Column(String)
    fine_amount = Column(Float)

    report = relationship("Report", back_populates="ticket")
    officer = relationship("User")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String, index=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(JSON)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

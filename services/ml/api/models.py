from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, JSON, String, Text, event, func, inspect, text
from sqlalchemy.orm import relationship

from .constants import ReportStatusEnum, RoleEnum, SmsNotificationStatusEnum, StatusChangeSourceEnum, StatusEnum, TicketStatusEnum
from .database import Base


ENUM_KWARGS = {"native_enum": False, "validate_strings": True}


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(RoleEnum, **ENUM_KWARGS), default=RoleEnum.CITIZEN)
    reward_points = Column(Float, default=0.0)
    created_at = Column(DateTime, default=func.now())

    reports = relationship("Report", back_populates="user")
    claimed_rewards = relationship("UserReward", back_populates="user")
    status_history_entries = relationship("StatusHistory", back_populates="changed_by_user")


class Citizen(Base):
    __tablename__ = "citizens"
    __table_args__ = (
        Index("ix_citizens_phone_number", "phone_number", unique=True),
        Index("ix_citizens_firebase_uid", "firebase_uid", unique=True),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    firebase_uid = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    verified_at = Column(DateTime, nullable=False, default=func.now())
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    evidence_reports = relationship(
        "EvidenceReport",
        back_populates="citizen",
        cascade="all, delete-orphan",
        order_by="EvidenceReport.created_at",
    )
    sms_notifications = relationship(
        "SmsNotification",
        back_populates="citizen",
        cascade="all, delete-orphan",
        order_by="SmsNotification.attempted_at",
    )
    status_history_entries = relationship("StatusHistory", back_populates="changed_by_citizen")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tracking_id = Column(String, unique=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    claimed_violation_type = Column(String, index=True)
    inferred_violation_type = Column(String, index=True)
    violation_type = Column(String, index=True)
    datetime = Column(DateTime, index=True)
    location_lat = Column(Float)
    location_lng = Column(Float)
    location_address = Column(String)
    location_city = Column(String)
    status = Column(Enum(StatusEnum, **ENUM_KWARGS), default=StatusEnum.SUBMITTED, index=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="reports")
    evidence = relationship("Evidence", back_populates="report")
    inference_log = relationship("InferenceLog", back_populates="report", uselist=False)
    ticket = relationship(
        "TrafficTicket",
        back_populates="report",
        uselist=False,
        foreign_keys="TrafficTicket.report_id",
    )


class EvidenceReport(Base):
    __tablename__ = "evidence_reports"
    __table_args__ = (
        Index("ix_evidence_reports_tracking_id", "tracking_id", unique=True),
        Index("ix_evidence_reports_citizen_created_at", "citizen_id", "created_at"),
        Index("ix_evidence_reports_status_created_at", "status", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tracking_id = Column(String, nullable=False)
    citizen_id = Column(String, ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False, index=True)
    violation_type = Column(String, nullable=False, index=True)
    incident_at = Column(DateTime, nullable=False, index=True)
    location_lat = Column(Float, nullable=False)
    location_lng = Column(Float, nullable=False)
    location_address = Column(String)
    location_city = Column(String, index=True)
    description = Column(Text)
    vehicle_plate = Column(String)
    vehicle_type = Column(String)
    status = Column(Enum(ReportStatusEnum, **ENUM_KWARGS), nullable=False, default=ReportStatusEnum.SUBMITTED, index=True)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    citizen = relationship("Citizen", back_populates="evidence_reports")
    files = relationship(
        "EvidenceFile",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="EvidenceFile.created_at",
    )
    status_history = relationship(
        "StatusHistory",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="StatusHistory.changed_at",
    )
    sms_notifications = relationship(
        "SmsNotification",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="SmsNotification.attempted_at",
    )
    ticket = relationship(
        "TrafficTicket",
        back_populates="evidence_report",
        uselist=False,
        foreign_keys="TrafficTicket.evidence_report_id",
    )

    def set_status(
        self,
        new_status: ReportStatusEnum,
        *,
        notes: str | None = None,
        source: StatusChangeSourceEnum = StatusChangeSourceEnum.SYSTEM,
        changed_by_user_id: str | None = None,
        changed_by_citizen_id: str | None = None,
        details: dict | None = None,
    ) -> None:
        self._pending_status_change_context = {
            "notes": notes,
            "change_source": source,
            "changed_by_user_id": changed_by_user_id,
            "changed_by_citizen_id": changed_by_citizen_id,
            "details": details or {},
        }
        self.status = new_status


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("reports.id"), index=True)
    type = Column(String)
    url = Column(String)
    name = Column(String)
    size = Column(Float)
    created_at = Column(DateTime, default=func.now())

    report = relationship("Report", back_populates="evidence")


class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    __table_args__ = (
        Index("ix_evidence_files_report_created_at", "report_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("evidence_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    file_type = Column(String, nullable=False)
    storage_url = Column(Text, nullable=False)
    original_name = Column(String, nullable=False)
    mime_type = Column(String)
    size_bytes = Column(Float, nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.now())

    report = relationship("EvidenceReport", back_populates="files")


class StatusHistory(Base):
    __tablename__ = "status_history"
    __table_args__ = (
        Index("ix_status_history_report_changed_at", "report_id", "changed_at"),
        Index("ix_status_history_new_status_changed_at", "new_status", "changed_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("evidence_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status = Column(Enum(ReportStatusEnum, **ENUM_KWARGS), nullable=True)
    new_status = Column(Enum(ReportStatusEnum, **ENUM_KWARGS), nullable=False, index=True)
    changed_by_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    changed_by_citizen_id = Column(String, ForeignKey("citizens.id"), nullable=True, index=True)
    change_source = Column(
        Enum(StatusChangeSourceEnum, **ENUM_KWARGS),
        nullable=False,
        default=StatusChangeSourceEnum.SYSTEM,
        index=True,
    )
    notes = Column(Text)
    details = Column(JSON, default=dict)
    changed_at = Column(DateTime, nullable=False, default=func.now(), index=True)

    report = relationship("EvidenceReport", back_populates="status_history")
    changed_by_user = relationship("User", back_populates="status_history_entries")
    changed_by_citizen = relationship("Citizen", back_populates="status_history_entries")


class InferenceLog(Base):
    __tablename__ = "inference_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id = Column(String, ForeignKey("reports.id"), unique=True, index=True)
    model_version = Column(String)
    bbox_coordinates = Column(JSON)
    confidence = Column(Float)
    ocr_text = Column(String, index=True)
    ocr_confidence = Column(Float)
    inference_latency = Column(Float)
    timestamp = Column(DateTime, default=func.now())

    report = relationship("Report", back_populates="inference_log")


class TrafficTicket(Base):
    """Enforcement ticket attached to a validated traffic violation report.

    Lifecycle: DRAFT → ISSUED → NOTIFIED → PAID/OVERDUE → APPEALED → CANCELLED → CLOSED
    See TicketStatusEnum and TICKET_STATUS_TRANSITIONS for the full state machine.

    Business rules:
    - A ticket can only be created after the parent report reaches VALIDATED status.
    - A report (legacy or evidence) may have at most one *active* ticket
      (i.e. not CANCELLED and not CLOSED).
    - All status transitions are recorded in the ticket_status_history table
      via SQLAlchemy event listeners.
    """

    __tablename__ = "traffic_tickets"
    __table_args__ = (
        Index("ix_traffic_tickets_ticket_number", "ticket_number", unique=True),
        Index("ix_traffic_tickets_status", "status"),
        Index("ix_traffic_tickets_evidence_report_id", "evidence_report_id"),
        Index("ix_traffic_tickets_report_status", "report_id", "status"),
        Index(
            "ix_unique_active_legacy_ticket",
            "report_id",
            unique=True,
            postgresql_where=text("status NOT IN ('CANCELLED', 'CLOSED')"),
            sqlite_where=text("status NOT IN ('CANCELLED', 'CLOSED')"),
        ),
        Index(
            "ix_unique_active_evidence_ticket",
            "evidence_report_id",
            unique=True,
            postgresql_where=text("status NOT IN ('CANCELLED', 'CLOSED')"),
            sqlite_where=text("status NOT IN ('CANCELLED', 'CLOSED')"),
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Human-readable ticket number, e.g. TKT-2026-A1B2C3D4
    ticket_number = Column(String, unique=True, nullable=False)

    # FK to legacy Report (nullable — a ticket may belong to an EvidenceReport instead).
    report_id = Column(String, ForeignKey("reports.id"), nullable=True)
    # FK to EvidenceReport (nullable — a ticket may belong to a legacy Report instead).
    evidence_report_id = Column(
        String, ForeignKey("evidence_reports.id"), nullable=True,
    )

    officer_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # --- Lifecycle status ---
    # Default is DRAFT; transitions are governed by TICKET_STATUS_TRANSITIONS.
    status = Column(
        Enum(TicketStatusEnum, **ENUM_KWARGS),
        nullable=False,
        default=TicketStatusEnum.DRAFT,
        index=True,
    )

    # --- Violation details (snapshot at issuance time) ---
    penal_code = Column(String, nullable=False)
    fine_amount = Column(Float, nullable=False)
    violation_type = Column(String, nullable=True)  # Copied from report's final violation type
    vehicle_plate = Column(String, nullable=True)   # Copied from report/inference at issuance

    # --- Offender information (for future notification & tracking) ---
    offender_name = Column(String, nullable=True)
    offender_contact = Column(String, nullable=True)

    # --- Payment tracking ---
    due_date = Column(DateTime, nullable=True)           # When the fine must be paid by
    paid_at = Column(DateTime, nullable=True)            # When payment was recorded
    payment_reference = Column(String, nullable=True)    # External payment transaction ref

    # --- Appeal tracking ---
    appeal_reason = Column(Text, nullable=True)          # Offender-supplied reason for appeal
    appealed_at = Column(DateTime, nullable=True)        # When the appeal was filed

    # --- Cancellation tracking ---
    cancelled_at = Column(DateTime, nullable=True)       # When the ticket was cancelled
    cancelled_reason = Column(Text, nullable=True)       # Reason for cancellation

    # --- General ---
    notes = Column(Text, nullable=True)                  # Free-form officer notes
    issued_at = Column(DateTime, nullable=True)          # When the ticket was formally issued
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    # --- Relationships ---
    report = relationship("Report", back_populates="ticket", foreign_keys=[report_id])
    evidence_report = relationship(
        "EvidenceReport", back_populates="ticket", foreign_keys=[evidence_report_id],
    )
    officer = relationship("User", foreign_keys=[officer_id])
    status_history = relationship(
        "TicketStatusHistory",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketStatusHistory.changed_at",
    )

    def set_status(
        self,
        new_status: TicketStatusEnum,
        *,
        notes: str | None = None,
        source: StatusChangeSourceEnum = StatusChangeSourceEnum.SYSTEM,
        changed_by_user_id: str | None = None,
        details: dict | None = None,
    ) -> None:
        """Set the ticket status and store context for the event listener.

        The actual TicketStatusHistory row is created by the SQLAlchemy
        ``after_insert`` / ``after_update`` event listeners below.
        """
        self._pending_ticket_status_context = {
            "notes": notes,
            "change_source": source,
            "changed_by_user_id": changed_by_user_id,
            "details": details or {},
        }
        self.status = new_status


class TicketStatusHistory(Base):
    """Audit log for every TrafficTicket status transition.

    Automatically populated by SQLAlchemy event listeners on TrafficTicket.
    """

    __tablename__ = "ticket_status_history"
    __table_args__ = (
        Index("ix_ticket_status_history_ticket_changed_at", "ticket_id", "changed_at"),
        Index("ix_ticket_status_history_new_status_changed_at", "new_status", "changed_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(
        String, ForeignKey("traffic_tickets.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    previous_status = Column(Enum(TicketStatusEnum, **ENUM_KWARGS), nullable=True)
    new_status = Column(Enum(TicketStatusEnum, **ENUM_KWARGS), nullable=False, index=True)
    changed_by_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    change_source = Column(
        Enum(StatusChangeSourceEnum, **ENUM_KWARGS),
        nullable=False,
        default=StatusChangeSourceEnum.SYSTEM,
        index=True,
    )
    notes = Column(Text, nullable=True)
    details = Column(JSON, default=dict)
    changed_at = Column(DateTime, nullable=False, default=func.now(), index=True)

    ticket = relationship("TrafficTicket", back_populates="status_history")
    changed_by_user = relationship("User")


class SmsNotification(Base):
    __tablename__ = "sms_notifications"
    __table_args__ = (
        Index("ix_sms_notifications_citizen_attempted_at", "citizen_id", "attempted_at"),
        Index("ix_sms_notifications_report_attempted_at", "report_id", "attempted_at"),
        Index("ix_sms_notifications_phone_attempted_at", "phone_number", "attempted_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    citizen_id = Column(String, ForeignKey("citizens.id", ondelete="SET NULL"), nullable=True, index=True)
    report_id = Column(String, ForeignKey("evidence_reports.id", ondelete="SET NULL"), nullable=True, index=True)
    phone_number = Column(String, nullable=False, index=True)
    template_key = Column(String, index=True)
    provider = Column(String)
    provider_message_id = Column(String, index=True)
    message_body = Column(Text)
    delivery_status = Column(
        Enum(SmsNotificationStatusEnum, **ENUM_KWARGS),
        nullable=False,
        default=SmsNotificationStatusEnum.PENDING,
        index=True,
    )
    error_message = Column(Text)
    details = Column(JSON, default=dict)
    attempted_at = Column(DateTime, nullable=False, default=func.now(), index=True)

    citizen = relationship("Citizen", back_populates="sms_notifications")
    report = relationship("EvidenceReport", back_populates="sms_notifications")


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String)
    description = Column(Text)
    points_cost = Column(Float)
    image_url = Column(String, nullable=True)


class UserReward(Base):
    __tablename__ = "user_rewards"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    reward_id = Column(String, ForeignKey("rewards.id"))
    claimed_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="claimed_rewards")
    reward = relationship("Reward")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String, index=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(JSON)
    timestamp = Column(DateTime, default=func.now())


@event.listens_for(EvidenceReport, "after_insert")
def _log_initial_report_status(_mapper, connection, target: EvidenceReport) -> None:
    context = getattr(target, "_pending_status_change_context", None) or {}
    connection.execute(
        StatusHistory.__table__.insert().values(
            id=str(uuid.uuid4()),
            report_id=target.id,
            previous_status=None,
            new_status=target.status,
            changed_by_user_id=context.get("changed_by_user_id"),
            changed_by_citizen_id=context.get("changed_by_citizen_id"),
            change_source=context.get("change_source", StatusChangeSourceEnum.SYSTEM),
            notes=context.get("notes"),
            details=context.get("details", {}),
            changed_at=func.now(),
        )
    )
    if hasattr(target, "_pending_status_change_context"):
        delattr(target, "_pending_status_change_context")


@event.listens_for(EvidenceReport, "after_update")
def _log_report_status_change(_mapper, connection, target: EvidenceReport) -> None:
    status_history = inspect(target).attrs.status.history
    if not status_history.has_changes():
        return

    previous_status = status_history.deleted[0] if status_history.deleted else None
    new_status = status_history.added[0] if status_history.added else target.status
    context = getattr(target, "_pending_status_change_context", None) or {}

    connection.execute(
        StatusHistory.__table__.insert().values(
            id=str(uuid.uuid4()),
            report_id=target.id,
            previous_status=previous_status,
            new_status=new_status,
            changed_by_user_id=context.get("changed_by_user_id"),
            changed_by_citizen_id=context.get("changed_by_citizen_id"),
            change_source=context.get("change_source", StatusChangeSourceEnum.SYSTEM),
            notes=context.get("notes"),
            details=context.get("details", {}),
            changed_at=func.now(),
        )
    )
    if hasattr(target, "_pending_status_change_context"):
        delattr(target, "_pending_status_change_context")


# ---------------------------------------------------------------------------
# TrafficTicket status-change event listeners (mirrors the EvidenceReport pattern)
# ---------------------------------------------------------------------------


@event.listens_for(TrafficTicket, "after_insert")
def _log_initial_ticket_status(_mapper, connection, target: TrafficTicket) -> None:
    """Record the initial status of a newly created ticket."""
    context = getattr(target, "_pending_ticket_status_context", None) or {}
    connection.execute(
        TicketStatusHistory.__table__.insert().values(
            id=str(uuid.uuid4()),
            ticket_id=target.id,
            previous_status=None,
            new_status=target.status,
            changed_by_user_id=context.get("changed_by_user_id"),
            change_source=context.get("change_source", StatusChangeSourceEnum.SYSTEM),
            notes=context.get("notes"),
            details=context.get("details", {}),
            changed_at=func.now(),
        )
    )
    if hasattr(target, "_pending_ticket_status_context"):
        delattr(target, "_pending_ticket_status_context")


@event.listens_for(TrafficTicket, "after_update")
def _log_ticket_status_change(_mapper, connection, target: TrafficTicket) -> None:
    """Record every status transition on an existing ticket."""
    status_history = inspect(target).attrs.status.history
    if not status_history.has_changes():
        return

    previous_status = status_history.deleted[0] if status_history.deleted else None
    new_status = status_history.added[0] if status_history.added else target.status
    context = getattr(target, "_pending_ticket_status_context", None) or {}

    connection.execute(
        TicketStatusHistory.__table__.insert().values(
            id=str(uuid.uuid4()),
            ticket_id=target.id,
            previous_status=previous_status,
            new_status=new_status,
            changed_by_user_id=context.get("changed_by_user_id"),
            change_source=context.get("change_source", StatusChangeSourceEnum.SYSTEM),
            notes=context.get("notes"),
            details=context.get("details", {}),
            changed_at=func.now(),
        )
    )
    if hasattr(target, "_pending_ticket_status_context"):
        delattr(target, "_pending_ticket_status_context")

"""Dedicated ticket lifecycle router.

Provides endpoints for creating, listing, retrieving, and transitioning
enforcement tickets through their lifecycle statuses.

Business rules enforced:
    1. A ticket can only be created when the parent report is VALIDATED.
    2. A report cannot have more than one active ticket (non-CANCELLED/CLOSED).
    3. Ticket issuance is transactional (single db.commit()).
    4. Every status change is audited in TicketStatusHistory AND AuditLog.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..constants import StatusChangeSourceEnum, TicketStatusEnum
from ..database import get_db
from ..dependencies import get_police, log_audit_action
from ..tracking import apply_ticket_status, is_valid_ticket_status_transition
from ..services.pdf_generator import generate_ticket_pdf
from ..violation_types import canonical_or_original_violation_type, deduplicate_violation_types, violation_type_variants

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_ticket_number() -> str:
    """Generate a human-readable ticket number: TKT-YYYY-XXXXXXXXXXXX."""
    return f"TKT-{datetime.now().year}-{uuid.uuid4().hex[:12].upper()}"


def _ticket_query(db: Session):
    """Base query with eagerly loaded relationships."""
    return db.query(models.TrafficTicket).options(
        joinedload(models.TrafficTicket.status_history),
    )


def _resolve_status_enum(raw: str) -> TicketStatusEnum:
    """Parse a string into a TicketStatusEnum, raising 400 on failure."""
    try:
        return TicketStatusEnum(raw)
    except ValueError:
        valid = [s.value for s in TicketStatusEnum]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ticket status '{raw}'. Valid values: {valid}",
        )


def _status_source_for_user(user: models.User) -> StatusChangeSourceEnum:
    """Determine the audit source tag based on user role."""
    if user.role == models.RoleEnum.ADMIN:
        return StatusChangeSourceEnum.ADMIN
    return StatusChangeSourceEnum.POLICE


def _assert_no_active_ticket_for_report(
    db: Session,
    *,
    report_id: str | None = None,
    evidence_report_id: str | None = None,
) -> None:
    """Raise 400 if an active (non-CANCELLED / non-CLOSED) ticket already exists."""
    query = db.query(models.TrafficTicket).filter(
        models.TrafficTicket.status.notin_([
            TicketStatusEnum.CANCELLED,
            TicketStatusEnum.CLOSED,
        ])
    )
    if report_id:
        query = query.filter(models.TrafficTicket.report_id == report_id)
    elif evidence_report_id:
        query = query.filter(
            models.TrafficTicket.evidence_report_id == evidence_report_id,
        )
    else:
        return  # No report reference — nothing to check.

    if query.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="An active ticket already exists for this report.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=schemas.TicketResponse)
@router.post("/", include_in_schema=False)
def create_ticket(
    ticket_data: schemas.TicketCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Create a new enforcement ticket.

    - Exactly one of ``report_id`` or ``evidence_report_id`` must be provided.
    - The referenced report must be in VALIDATED status.
    - No other active ticket may exist for the same report.
    - If ``issue_immediately`` is True (default), the ticket is created
      directly in ISSUED status with ``issued_at`` set to now.
    """
    # --- Validate exactly one report reference ---
    if not ticket_data.report_id and not ticket_data.evidence_report_id:
        raise HTTPException(
            status_code=400,
            detail="Either report_id or evidence_report_id must be provided.",
        )
    if ticket_data.report_id and ticket_data.evidence_report_id:
        raise HTTPException(
            status_code=400,
            detail="Provide only one of report_id or evidence_report_id, not both.",
        )

    # --- Validate parent report exists and is VALIDATED ---
    violation_type_snapshot: str | None = ticket_data.violation_type
    vehicle_plate_snapshot: str | None = ticket_data.vehicle_plate

    if ticket_data.report_id:
        report = db.query(models.Report).filter(
            models.Report.id == ticket_data.report_id,
        ).first()
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        if report.status != models.StatusEnum.VALIDATED:
            raise HTTPException(
                status_code=400,
                detail="Report must be VALIDATED before a ticket can be issued.",
            )
        # Snapshot violation info from the report if not explicitly provided.
        if not violation_type_snapshot:
            violation_type_snapshot = (
                report.violation_type
                or report.inferred_violation_type
                or report.claimed_violation_type
            )
        if not vehicle_plate_snapshot and report.inference_log:
            vehicle_plate_snapshot = report.inference_log.ocr_text
    else:
        evidence_report = db.query(models.EvidenceReport).filter(
            models.EvidenceReport.id == ticket_data.evidence_report_id,
        ).first()
        if evidence_report is None:
            raise HTTPException(status_code=404, detail="Evidence report not found.")
        if evidence_report.status != models.StatusEnum.VALIDATED:
            raise HTTPException(
                status_code=400,
                detail="Evidence report must be VALIDATED before a ticket can be issued.",
            )
        if not violation_type_snapshot:
            violation_type_snapshot = evidence_report.violation_type
        if not vehicle_plate_snapshot:
            vehicle_plate_snapshot = (
                evidence_report.inference_log.ocr_text
                if evidence_report.inference_log and evidence_report.inference_log.ocr_text
                else evidence_report.vehicle_plate
            )

    # --- Process Fine Rule / Override ---
    final_penal_code = ticket_data.penal_code
    final_fine_amount = ticket_data.fine_amount
    fine_rule_id = None
    fine_rule_version = None

    if final_penal_code is not None or final_fine_amount is not None:
        if not ticket_data.fine_override_reason:
            raise HTTPException(
                status_code=400,
                detail="fine_override_reason is required when manually providing penal_code or fine_amount.",
            )
        if final_penal_code is None or final_fine_amount is None:
            raise HTTPException(
                status_code=400,
                detail="Both penal_code and fine_amount must be provided when overriding.",
            )
    else:
        # Fetch default fine rule
        if not violation_type_snapshot:
            raise HTTPException(
                status_code=400,
                detail="Cannot determine fine rule because violation_type is missing.",
            )
        fine_rule_candidates = deduplicate_violation_types(
            [canonical_or_original_violation_type(violation_type_snapshot), *violation_type_variants(violation_type_snapshot)]
        )
        rule = db.query(models.FineRule).filter(
            models.FineRule.violation_type.in_(fine_rule_candidates),
            models.FineRule.active == True
        ).first()
        if not rule:
            raise HTTPException(
                status_code=400,
                detail=f"No active fine rule configured for violation type: {violation_type_snapshot}",
            )
        final_penal_code = rule.penal_code
        final_fine_amount = rule.fine_amount
        fine_rule_id = rule.id
        fine_rule_version = rule.version

    # --- Ensure no duplicate active ticket ---
    _assert_no_active_ticket_for_report(
        db,
        report_id=ticket_data.report_id,
        evidence_report_id=ticket_data.evidence_report_id,
    )

    # --- Determine initial status ---
    # DRAFT → needs a subsequent ISSUED transition.
    # ISSUED → ready for enforcement immediately.
    initial_status = (
        TicketStatusEnum.ISSUED if ticket_data.issue_immediately
        else TicketStatusEnum.DRAFT
    )

    new_ticket = models.TrafficTicket(
        ticket_number=_generate_ticket_number(),
        report_id=ticket_data.report_id,
        evidence_report_id=ticket_data.evidence_report_id,
        officer_id=current_user.id,
        fine_rule_id=fine_rule_id,
        fine_rule_version=fine_rule_version,
        penal_code=final_penal_code,
        fine_amount=final_fine_amount,
        fine_override_reason=ticket_data.fine_override_reason,
        violation_type=violation_type_snapshot,
        vehicle_plate=vehicle_plate_snapshot,
        offender_name=ticket_data.offender_name,
        offender_contact=ticket_data.offender_contact,
        notes=ticket_data.notes,
        issued_at=datetime.utcnow() if ticket_data.issue_immediately else None,
    )

    # Set status via the audited helper (populates event-listener context).
    apply_ticket_status(
        new_ticket,
        initial_status,
        notes=f"Ticket created in {initial_status.value} status.",
        source=_status_source_for_user(current_user),
        changed_by_user_id=current_user.id,
        details={
            "penal_code": final_penal_code,
            "fine_amount": final_fine_amount,
            "override_reason": ticket_data.fine_override_reason,
            "fine_rule_id": fine_rule_id,
        },
    )

    db.add(new_ticket)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An active ticket already exists for this report.",
        ) from exc
    db.refresh(new_ticket)

    # Audit log entry (generic audit table).
    log_audit_action(
        db,
        current_user.id,
        "TICKET_CREATED",
        "TrafficTicket",
        new_ticket.id,
        details={
            "ticket_number": new_ticket.ticket_number,
            "status": new_ticket.status.value,
            "penal_code": new_ticket.penal_code,
            "fine_amount": new_ticket.fine_amount,
            "fine_override_reason": new_ticket.fine_override_reason,
            "report_id": new_ticket.report_id,
            "evidence_report_id": new_ticket.evidence_report_id,
        },
    )

    # Re-fetch with relationships loaded.
    return _ticket_query(db).filter(
        models.TrafficTicket.id == new_ticket.id,
    ).first()


@router.get("", response_model=List[schemas.TicketSummaryResponse])
@router.get("/", include_in_schema=False)
def list_tickets(
    status: Optional[str] = Query(None, description="Filter by ticket status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """List all tickets, optionally filtered by status."""
    query = db.query(models.TrafficTicket).order_by(
        models.TrafficTicket.created_at.desc(),
    )
    if status:
        enum_status = _resolve_status_enum(status)
        query = query.filter(models.TrafficTicket.status == enum_status)
    return query.all()


@router.get("/{ticket_id}", response_model=schemas.TicketResponse)
def get_ticket_by_id(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Get a single ticket with its full status history."""
    ticket = _ticket_query(db).filter(
        models.TrafficTicket.id == ticket_id,
    ).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return ticket


@router.get("/by-report/{report_id}", response_model=schemas.TicketResponse)
def get_ticket_by_report_id(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Get the ticket associated with a legacy Report."""
    ticket = _ticket_query(db).filter(
        models.TrafficTicket.report_id == report_id,
    ).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="No ticket found for this report.")
    return ticket


@router.get(
    "/by-evidence-report/{report_id}",
    response_model=schemas.TicketResponse,
)
def get_ticket_by_evidence_report_id(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Get the ticket associated with an EvidenceReport."""
    ticket = _ticket_query(db).filter(
        models.TrafficTicket.evidence_report_id == report_id,
    ).first()
    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail="No ticket found for this evidence report.",
        )
    return ticket


@router.put("/{ticket_id}/status", response_model=schemas.TicketResponse)
def update_ticket_status(
    ticket_id: str,
    update: schemas.TicketStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Advance a ticket through its lifecycle.

    Status transition rules (see TICKET_STATUS_TRANSITIONS):
    - DRAFT → ISSUED | CANCELLED
    - ISSUED → NOTIFIED | PAID | APPEALED | CANCELLED
    - NOTIFIED → PAID | OVERDUE | APPEALED | CANCELLED
    - PAID → CLOSED
    - OVERDUE → PAID | APPEALED | CANCELLED
    - APPEALED → CANCELLED | ISSUED (re-affirmed)
    - CANCELLED → CLOSED
    - CLOSED → (none)
    """
    ticket = _ticket_query(db).filter(
        models.TrafficTicket.id == ticket_id,
    ).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    new_status = _resolve_status_enum(update.status)
    previous_status = ticket.status

    if not is_valid_ticket_status_transition(previous_status, new_status):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid ticket transition from {previous_status.value} "
                f"to {new_status.value}."
            ),
        )

    # --- Apply status-specific side-effects ---
    now = datetime.utcnow()

    # DRAFT → ISSUED: record issuance timestamp.
    if new_status == TicketStatusEnum.ISSUED:
        ticket.issued_at = ticket.issued_at or now

    # → PAID: record payment details.
    if new_status == TicketStatusEnum.PAID:
        ticket.paid_at = now
        if update.payment_reference:
            ticket.payment_reference = update.payment_reference

    # → APPEALED: record appeal details.
    if new_status == TicketStatusEnum.APPEALED:
        ticket.appealed_at = now
        if update.appeal_reason:
            ticket.appeal_reason = update.appeal_reason

    # → CANCELLED: record cancellation details.
    if new_status == TicketStatusEnum.CANCELLED:
        ticket.cancelled_at = now
        if update.cancelled_reason:
            ticket.cancelled_reason = update.cancelled_reason

    # Append officer notes if provided.
    if update.notes:
        existing_notes = ticket.notes or ""
        separator = "\n---\n" if existing_notes else ""
        ticket.notes = f"{existing_notes}{separator}{update.notes}"

    # Apply the status change with audit context.
    apply_ticket_status(
        ticket,
        new_status,
        notes=update.notes,
        source=_status_source_for_user(current_user),
        changed_by_user_id=current_user.id,
        details={
            "previous_status": previous_status.value,
            "new_status": new_status.value,
            "payment_reference": update.payment_reference,
            "appeal_reason": update.appeal_reason,
            "cancelled_reason": update.cancelled_reason,
        },
    )

    db.commit()

    # Generic audit log.
    log_audit_action(
        db,
        current_user.id,
        f"TICKET_STATUS_UPDATE_{previous_status.value}_TO_{new_status.value}",
        "TrafficTicket",
        ticket.id,
        details={
            "ticket_number": ticket.ticket_number,
            "previous_status": previous_status.value,
            "new_status": new_status.value,
        },
    )

    # Re-fetch with fresh status history.
    return _ticket_query(db).filter(
        models.TrafficTicket.id == ticket.id,
    ).first()

@router.get("/{ticket_id}/notice.pdf")
def download_ticket_notice_pdf(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Generate and download a secure PDF notice for the ticket."""
    ticket = _ticket_query(db).filter(
        models.TrafficTicket.id == ticket_id,
    ).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    pdf_bytes = bytes(generate_ticket_pdf(ticket))
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="notice_{ticket.ticket_number}.pdf"'
        }
    )

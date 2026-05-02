import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from typing import List

from .. import models, schemas
from ..constants import StatusChangeSourceEnum, TicketStatusEnum
from ..database import get_db
from ..dependencies import get_current_active_user, get_citizen, get_police, log_audit_action
from ..presenters import present_report, present_reports
from ..tracking import is_valid_report_status_transition, apply_ticket_status, is_valid_ticket_status_transition
from ..violation_types import canonical_or_original_violation_type, deduplicate_violation_types, violation_type_variants

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.post("", response_model=schemas.ReportResponse)
@router.post("/", include_in_schema=False)
def create_report(report_data: schemas.ReportCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_citizen)):
    new_report = models.Report(
        tracking_id=f"LEX-{datetime.now().year}-{str(uuid.uuid4())[:8].upper()}",
        user_id=current_user.id,
        claimed_violation_type=report_data.violation_type,
        inferred_violation_type=None,
        violation_type=None,
        datetime=report_data.datetime,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        location_city=report_data.location_city,
        status=models.StatusEnum.SUBMITTED
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    for ev_data in report_data.evidence:
        ev = models.Evidence(
            report_id=new_report.id,
            type=ev_data.type,
            url=ev_data.url,
            name=ev_data.name,
            size=ev_data.size
        )
        db.add(ev)
    
    db.commit()
    db.refresh(new_report)

    # Trigger Async inference task (implemented in worker)
    from ..tasks import submit_inference_task
    submit_inference_task(new_report.id, background_tasks)

    # Audit log
    log_audit_action(db, current_user.id, "REPORT_SUBMISSION", "Report", new_report.id)

    return present_report(new_report)

@router.get("", response_model=List[schemas.ReportResponse])
@router.get("/", include_in_schema=False)
def get_reports(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    query = db.query(models.Report).options(
        joinedload(models.Report.evidence),
        joinedload(models.Report.inference_log)
    )
    if current_user.role == models.RoleEnum.CITIZEN:
        # Citizens only see their own
        reports = query.filter(models.Report.user_id == current_user.id).order_by(models.Report.created_at.desc()).all()
    else:
        # Police and Admin see all reports
        reports = query.order_by(models.Report.created_at.desc()).all()
    return present_reports(reports)

@router.get("/tracking/{tracking_id}", response_model=schemas.ReportResponse)
def get_report_by_tracking_id(tracking_id: str, db: Session = Depends(get_db)):
    report = db.query(models.Report).options(
        joinedload(models.Report.evidence),
        joinedload(models.Report.inference_log)
    ).filter(models.Report.tracking_id == tracking_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return present_report(report)

@router.get("/{report_id}", response_model=schemas.ReportResponse)
def get_report_by_id(report_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    report = db.query(models.Report).options(
        joinedload(models.Report.evidence),
        joinedload(models.Report.inference_log)
    ).filter(models.Report.id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Citizens can only view their own reports
    if current_user.role == models.RoleEnum.CITIZEN and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this report")
    
    return present_report(report)

@router.put("/{report_id}/status", response_model=schemas.ReportResponse)
def update_report_status(report_id: str, update: schemas.ReportStatusUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_police)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if not is_valid_report_status_transition(report.status, update.status):
        raise HTTPException(status_code=400, detail=f"Invalid transition from {report.status} to {update.status}")
    
    report.status = update.status
    if update.status == models.StatusEnum.VALIDATED:
        # The final violation type is assigned only after officer validation.
        report.violation_type = report.inferred_violation_type or report.claimed_violation_type
        # Award points to the citizen who reported it
        report.user.reward_points += 50.0
    
    db.commit()
    db.refresh(report)

    log_audit_action(db, current_user.id, f"REPORT_STATUS_UPDATE_TO_{update.status}", "Report", report.id)

    db.refresh(report)
    return present_report(report)

@router.post("/{report_id}/ticket", response_model=schemas.TicketResponse)
def issue_ticket(report_id: str, ticket_data: schemas.TicketCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_police)):
    """Issue a ticket for a validated legacy Report.

    This is the backward-compatible endpoint. It delegates to the new
    ticket lifecycle logic, creating the ticket directly in ISSUED status.

    Business rules:
    1. Report must be in VALIDATED status (police validation required).
    2. No other active ticket may exist for this report.
    3. Issuance is transactional — all-or-nothing.
    """
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if report.status != models.StatusEnum.VALIDATED:
        raise HTTPException(status_code=400, detail="Report must be VALIDATED before issuing a ticket")
        
    # Rule 2: no duplicate active tickets.
    existing_ticket = db.query(models.TrafficTicket).filter(
        models.TrafficTicket.report_id == report_id,
        models.TrafficTicket.status.notin_([
            TicketStatusEnum.CANCELLED,
            TicketStatusEnum.CLOSED,
        ]),
    ).first()
    if existing_ticket:
        raise HTTPException(status_code=400, detail="An active ticket already exists for this report")

    # Snapshot violation/plate info from the report.
    violation_type = (
        ticket_data.violation_type
        or report.violation_type
        or report.inferred_violation_type
        or report.claimed_violation_type
    )
    vehicle_plate = ticket_data.vehicle_plate
    if not vehicle_plate and report.inference_log:
        vehicle_plate = report.inference_log.ocr_text

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
        if not violation_type:
            raise HTTPException(
                status_code=400,
                detail="Cannot determine fine rule because violation_type is missing.",
            )
        fine_rule_candidates = deduplicate_violation_types(
            [canonical_or_original_violation_type(violation_type), *violation_type_variants(violation_type)]
        )
        rule = db.query(models.FineRule).filter(
            models.FineRule.violation_type.in_(fine_rule_candidates),
            models.FineRule.active == True
        ).first()
        if not rule:
            raise HTTPException(
                status_code=400,
                detail=f"No active fine rule configured for violation type: {violation_type}",
            )
        final_penal_code = rule.penal_code
        final_fine_amount = rule.fine_amount
        fine_rule_id = rule.id
        fine_rule_version = rule.version

    new_ticket = models.TrafficTicket(
        ticket_number=f"TKT-{datetime.now().year}-{uuid.uuid4().hex[:12].upper()}",
        report_id=report_id,
        officer_id=current_user.id,
        fine_rule_id=fine_rule_id,
        fine_rule_version=fine_rule_version,
        penal_code=final_penal_code,
        fine_amount=final_fine_amount,
        fine_override_reason=ticket_data.fine_override_reason,
        violation_type=violation_type,
        vehicle_plate=vehicle_plate,
        offender_name=ticket_data.offender_name,
        offender_contact=ticket_data.offender_contact,
        notes=ticket_data.notes,
        issued_at=datetime.utcnow(),
    )

    # Set status to ISSUED with full audit context.
    source = (
        StatusChangeSourceEnum.ADMIN
        if current_user.role == models.RoleEnum.ADMIN
        else StatusChangeSourceEnum.POLICE
    )
    apply_ticket_status(
        new_ticket,
        TicketStatusEnum.ISSUED,
        notes="Legacy ticket issued directly.",
        source=source,
        changed_by_user_id=current_user.id,
        details={
            "penal_code": final_penal_code,
            "fine_amount": final_fine_amount,
            "override_reason": ticket_data.fine_override_reason,
            "fine_rule_id": fine_rule_id,
        },
    )

    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    log_audit_action(
        db,
        current_user.id,
        "TICKET_GENERATION",
        "TrafficTicket",
        new_ticket.id,
        details={
            "ticket_number": new_ticket.ticket_number,
            "status": new_ticket.status.value,
            "penal_code": new_ticket.penal_code,
            "fine_amount": new_ticket.fine_amount,
            "fine_override_reason": new_ticket.fine_override_reason,
            "report_id": new_ticket.report_id,
            "legacy_endpoint": True,
        },
    )

    # Re-fetch with status_history loaded.
    return (
        db.query(models.TrafficTicket)
        .options(joinedload(models.TrafficTicket.status_history))
        .filter(models.TrafficTicket.id == new_ticket.id)
        .first()
    )


@router.get("/{report_id}/ticket", response_model=schemas.TicketResponse)
def get_report_ticket(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    """Retrieve the ticket associated with a legacy Report."""
    ticket = (
        db.query(models.TrafficTicket)
        .options(joinedload(models.TrafficTicket.status_history))
        .filter(models.TrafficTicket.report_id == report_id)
        .first()
    )
    if ticket is None:
        raise HTTPException(status_code=404, detail="No ticket found for this report")
    return ticket


@router.get("/{report_id}/evidence", response_model=List[schemas.EvidenceSchema])
def get_report_evidence(report_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_citizen)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if current_user.role == models.RoleEnum.CITIZEN and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view evidence for this report")
        
    log_audit_action(db, current_user.id, "EVIDENCE_RETRIEVAL", "Report", report_id)
    return report.evidence

import uuid
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_active_user, get_citizen, get_police, log_audit_action

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.post("/", response_model=schemas.ReportResponse)
def create_report(report_data: schemas.ReportCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_citizen)):
    new_report = models.Report(
        tracking_id=f"LEX-{datetime.now().year}-{str(uuid.uuid4())[:8].upper()}",
        user_id=current_user.id,
        violation_type=report_data.violation_type,
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

    return new_report

@router.get("/", response_model=List[schemas.ReportResponse])
def get_reports(db: Session = Depends(get_db), current_user: models.User = Depends(get_citizen)):
    if current_user.role == models.RoleEnum.CITIZEN:
        # Citizens only see their own
        reports = db.query(models.Report).filter(models.Report.user_id == current_user.id).all()
    else:
        reports = db.query(models.Report).all()
    return reports

VALID_TRANSITIONS = {
    models.StatusEnum.SUBMITTED: [models.StatusEnum.AI_PROCESSING],
    models.StatusEnum.AI_PROCESSING: [models.StatusEnum.UNDER_REVIEW],
    models.StatusEnum.UNDER_REVIEW: [models.StatusEnum.VALIDATED, models.StatusEnum.REJECTED],
    models.StatusEnum.VALIDATED: [],
    models.StatusEnum.REJECTED: []
}

@router.put("/{report_id}/status", response_model=schemas.ReportResponse)
def update_report_status(report_id: str, update: schemas.ReportStatusUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_police)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if update.status not in VALID_TRANSITIONS.get(report.status, []):
        raise HTTPException(status_code=400, detail=f"Invalid transition from {report.status} to {update.status}")
    
    report.status = update.status
    if update.status == models.StatusEnum.VALIDATED:
        # Award points to the citizen who reported it
        report.user.reward_points += 50.0
    
    db.commit()
    db.refresh(report)

    log_audit_action(db, current_user.id, f"REPORT_STATUS_UPDATE_TO_{update.status}", "Report", report.id)

    return report

@router.post("/{report_id}/ticket", response_model=schemas.TicketResponse)
def issue_ticket(report_id: str, ticket_data: schemas.TicketCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_police)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if report.status != models.StatusEnum.VALIDATED:
        raise HTTPException(status_code=400, detail="Report must be VALIDATED before issuing a ticket")
        
    existing_ticket = db.query(models.TrafficTicket).filter(models.TrafficTicket.report_id == report_id).first()
    if existing_ticket:
        raise HTTPException(status_code=400, detail="Ticket already issued for this report")

    new_ticket = models.TrafficTicket(
        report_id=report_id,
        officer_id=current_user.id,
        penal_code=ticket_data.penal_code,
        fine_amount=ticket_data.fine_amount
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    log_audit_action(db, current_user.id, "TICKET_GENERATION", "Ticket", new_ticket.id, details={"penal_code": ticket_data.penal_code, "fine": ticket_data.fine_amount})

    return new_ticket

@router.get("/{report_id}/evidence", response_model=List[schemas.EvidenceSchema])
def get_report_evidence(report_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_citizen)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if current_user.role == models.RoleEnum.CITIZEN and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view evidence for this report")
        
    log_audit_action(db, current_user.id, "EVIDENCE_RETRIEVAL", "Report", report_id)
    return report.evidence

import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..constants import SmsTemplateKeyEnum, StatusChangeSourceEnum
from ..database import get_db
from ..dependencies import get_current_citizen_account, log_audit_action
from ..sms import SmsSendRequest, dispatch_sms, render_sms_template
from ..tracking import apply_evidence_report_status

router = APIRouter(prefix="/api/citizen-reports", tags=["citizen-reports"])


def _citizen_report_query(db: Session):
    return db.query(models.EvidenceReport)


@router.post("", response_model=schemas.CitizenEvidenceReportResponse)
@router.post("/", include_in_schema=False)
def create_citizen_report(
    report_data: schemas.CitizenEvidenceReportCreate,
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    new_report = models.EvidenceReport(
        tracking_id=f"LEX-{datetime.now().year}-{str(uuid.uuid4())[:8].upper()}",
        citizen_id=current_citizen.id,
        violation_type=report_data.violation_type,
        incident_at=report_data.incident_at,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        location_city=report_data.location_city,
        description=report_data.description,
        vehicle_plate=report_data.vehicle_plate,
        vehicle_type=report_data.vehicle_type,
    )
    apply_evidence_report_status(
        new_report,
        models.ReportStatusEnum.SUBMITTED,
        source=StatusChangeSourceEnum.CITIZEN,
        changed_by_citizen_id=current_citizen.id,
        notes="Citizen submitted a verified OTP-backed evidence report.",
    )
    db.add(new_report)
    db.flush()

    for evidence_item in report_data.evidence:
        db.add(
            models.EvidenceFile(
                report_id=new_report.id,
                file_type=evidence_item.type,
                storage_url=evidence_item.url,
                original_name=evidence_item.name,
                mime_type=evidence_item.mime_type,
                size_bytes=evidence_item.size,
            )
        )

    db.commit()

    saved_report = (
        db.query(models.EvidenceReport)
        .options(joinedload(models.EvidenceReport.files))
        .filter(models.EvidenceReport.id == new_report.id)
        .first()
    )
    if saved_report is None:
        raise HTTPException(status_code=500, detail="Failed to load the saved report.")

    log_audit_action(
        db,
        None,
        "CITIZEN_REPORT_SUBMISSION",
        "EvidenceReport",
        saved_report.id,
        details={
            "citizen_id": current_citizen.id,
            "tracking_id": saved_report.tracking_id,
            "phone_number": current_citizen.phone_number,
        },
    )

    # SMS delivery is best-effort. Failed provider/config issues are recorded in sms_notifications
    # by dispatch_sms(), but they must not roll back or fail the already-saved report submission.
    rendered_sms = render_sms_template(
        SmsTemplateKeyEnum.CITIZEN_REPORT_SUBMITTED_CONFIRMATION,
        report=saved_report,
        citizen=current_citizen,
    )
    dispatch_sms(
        db,
        SmsSendRequest(
            phone_number=current_citizen.phone_number,
            message_body=rendered_sms.message_body,
            template_key=rendered_sms.template_key.value,
            citizen_id=current_citizen.id,
            report_id=saved_report.id,
            metadata=rendered_sms.metadata,
        ),
    )

    return saved_report


@router.get("/me", response_model=List[schemas.CitizenReportSummaryResponse])
def get_current_citizen_reports(
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    return (
        _citizen_report_query(db)
        .filter(models.EvidenceReport.citizen_id == current_citizen.id)
        .order_by(models.EvidenceReport.created_at.desc())
        .all()
    )


@router.get("/me/{report_id}", response_model=schemas.CitizenReportDetailResponse)
def get_current_citizen_report_detail(
    report_id: str,
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    report = (
        _citizen_report_query(db)
        .options(
            joinedload(models.EvidenceReport.files),
            joinedload(models.EvidenceReport.status_history),
        )
        .filter(
            models.EvidenceReport.id == report_id,
            models.EvidenceReport.citizen_id == current_citizen.id,
        )
        .first()
    )

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citizen report not found")

    return report


@router.get("/tracking/{tracking_id}", response_model=schemas.CitizenEvidenceReportResponse)
def get_citizen_report_by_tracking_id(tracking_id: str, db: Session = Depends(get_db)):
    report = (
        _citizen_report_query(db)
        .options(joinedload(models.EvidenceReport.files))
        .filter(models.EvidenceReport.tracking_id == tracking_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citizen report not found")

    return report

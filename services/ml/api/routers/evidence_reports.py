from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..constants import RoleEnum, StatusChangeSourceEnum
from ..database import get_db
from ..dependencies import get_police, log_audit_action
from ..sms import SmsSendRequest, dispatch_sms, render_status_change_sms_template
from ..tracking import apply_evidence_report_status, is_valid_report_status_transition

router = APIRouter(prefix="/api/evidence-reports", tags=["evidence-reports"])


def _staff_report_query(db: Session):
    return db.query(models.EvidenceReport).options(
        joinedload(models.EvidenceReport.files),
        joinedload(models.EvidenceReport.citizen),
    )


def _status_change_source_for_user(user: models.User) -> StatusChangeSourceEnum:
    return (
        StatusChangeSourceEnum.ADMIN
        if user.role == RoleEnum.ADMIN
        else StatusChangeSourceEnum.POLICE
    )


@router.get("", response_model=List[schemas.StaffEvidenceReportResponse])
@router.get("/", include_in_schema=False)
def list_evidence_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    return _staff_report_query(db).order_by(models.EvidenceReport.created_at.desc()).all()


@router.get("/{report_id}", response_model=schemas.StaffEvidenceReportResponse)
def get_evidence_report_by_id(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Evidence report not found")
    return report


@router.put("/{report_id}/status", response_model=schemas.StaffEvidenceReportResponse)
def update_evidence_report_status(
    report_id: str,
    update: schemas.ReportStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Evidence report not found")

    previous_status = report.status
    if not is_valid_report_status_transition(previous_status, update.status):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition from {previous_status} to {update.status}",
        )

    apply_evidence_report_status(
        report,
        update.status,
        notes=update.notes,
        source=_status_change_source_for_user(current_user),
        changed_by_user_id=current_user.id,
        details={
            "updated_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        },
    )
    db.commit()

    saved_report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if saved_report is None or saved_report.citizen is None:
        raise HTTPException(status_code=500, detail="Failed to reload the updated evidence report.")

    sms_outcome = None
    rendered_sms = render_status_change_sms_template(report=saved_report, citizen=saved_report.citizen)
    if rendered_sms is not None:
        sms_outcome = dispatch_sms(
            db,
            SmsSendRequest(
                phone_number=saved_report.citizen.phone_number,
                message_body=rendered_sms.message_body,
                template_key=rendered_sms.template_key.value,
                citizen_id=saved_report.citizen_id,
                report_id=saved_report.id,
                metadata=rendered_sms.metadata,
            ),
        )

    log_audit_action(
        db,
        current_user.id,
        f"EVIDENCE_REPORT_STATUS_UPDATE_TO_{update.status}",
        "EvidenceReport",
        saved_report.id,
        details={
            "previous_status": previous_status.value if hasattr(previous_status, "value") else str(previous_status),
            "new_status": update.status.value if hasattr(update.status, "value") else str(update.status),
            "tracking_id": saved_report.tracking_id,
            "sms_logged": rendered_sms is not None,
            "sms_delivery_status": (
                sms_outcome.notification.delivery_status.value
                if sms_outcome is not None and hasattr(sms_outcome.notification.delivery_status, "value")
                else None
            ),
        },
    )

    return saved_report

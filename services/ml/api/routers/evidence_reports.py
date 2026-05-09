from __future__ import annotations

from dataclasses import asdict
from typing import List

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..constants import RoleEnum, StatusChangeSourceEnum
from ..database import get_db
from ..dependencies import get_police, log_audit_action
from ..presenters import present_evidence_report, present_evidence_reports
from ..sms import SmsSendRequest, render_status_change_sms_template
from ..tasks import submit_sms_task
from ..tracking import apply_evidence_report_status, is_valid_report_status_transition
from ..worker import attempt_inference
from ..services.notifications import notify_citizen, notify_admins

try:
    from services.ml.inference.plate_format import normalize_sri_lankan_plate
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.inference", "services.ml.inference.plate_format"}:
        raise
    from inference.plate_format import normalize_sri_lankan_plate

router = APIRouter(prefix="/api/evidence-reports", tags=["evidence-reports"])


def _staff_report_query(db: Session):
    return db.query(models.EvidenceReport).options(
        joinedload(models.EvidenceReport.files),
        joinedload(models.EvidenceReport.citizen),
        joinedload(models.EvidenceReport.inference_log),
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
    reports = _staff_report_query(db).order_by(models.EvidenceReport.created_at.desc()).all()
    return present_evidence_reports(reports)


@router.get("/page")
def list_evidence_reports_page(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
    violation_type: str | None = None,
    district: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    officer_id: str | None = None,
    search: str | None = None,
    sort: str = Query("newest", pattern="^(newest|oldest|confidence|status)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    query = _staff_report_query(db).outerjoin(models.InferenceLog, models.InferenceLog.evidence_report_id == models.EvidenceReport.id)

    if status_filter and status_filter != "all":
        try:
            normalized_status = models.ReportStatusEnum(status_filter.upper().replace("-", "_"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid report status filter.") from exc
        query = query.filter(models.EvidenceReport.status == normalized_status)
    if violation_type and violation_type != "all":
        query = query.filter(models.EvidenceReport.violation_type == violation_type)
    if district and district != "all":
        query = query.filter(models.EvidenceReport.location_district == district)
    if date_from:
        query = query.filter(models.EvidenceReport.created_at >= date_from)
    if date_to:
        query = query.filter(models.EvidenceReport.created_at <= date_to)
    if officer_id:
        query = query.join(models.StatusHistory).filter(models.StatusHistory.changed_by_user_id == officer_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.outerjoin(models.Citizen, models.Citizen.id == models.EvidenceReport.citizen_id).filter(
            or_(
                models.EvidenceReport.tracking_id.ilike(pattern),
                models.EvidenceReport.vehicle_plate.ilike(pattern),
                models.EvidenceReport.location_district.ilike(pattern),
                models.InferenceLog.ocr_text.ilike(pattern),
                models.Citizen.phone_number.ilike(pattern),
            )
        )

    total = query.with_entities(func.count(models.EvidenceReport.id.distinct())).scalar() or 0

    if sort == "oldest":
        query = query.order_by(models.EvidenceReport.created_at.asc())
    elif sort == "confidence":
        query = query.order_by(models.InferenceLog.confidence.desc().nullslast(), models.EvidenceReport.created_at.desc())
    elif sort == "status":
        query = query.order_by(models.EvidenceReport.status.asc(), models.EvidenceReport.created_at.desc())
    else:
        query = query.order_by(models.EvidenceReport.created_at.desc())

    items = query.offset(offset).limit(limit).all()
    return {
        "items": present_evidence_reports(items),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{report_id}", response_model=schemas.StaffEvidenceReportResponse)
def get_evidence_report_by_id(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Evidence report not found")
    return present_evidence_report(report)


@router.put("/{report_id}/status", response_model=schemas.StaffEvidenceReportResponse)
def update_evidence_report_status(
    report_id: str,
    update: schemas.ReportStatusUpdate,
    background_tasks: BackgroundTasks,
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

    rendered_sms = render_status_change_sms_template(report=saved_report, citizen=saved_report.citizen)
    if rendered_sms is not None:
        submit_sms_task(
            background_tasks,
            asdict(SmsSendRequest(
                phone_number=saved_report.citizen.phone_number,
                message_body=rendered_sms.message_body,
                template_key=rendered_sms.template_key.value,
                citizen_id=saved_report.citizen_id,
                report_id=saved_report.id,
                metadata=rendered_sms.metadata,
            )),
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
            "sms_delivery_status": "queued" if rendered_sms is not None else None,
        },
    )

    # In-app notifications per new status — best-effort.
    try:
        new_status_val = update.status.value if hasattr(update.status, "value") else str(update.status)
        citizen_id = saved_report.citizen_id
        report_id = saved_report.id
        tracking_id = saved_report.tracking_id
        meta = {
            "tracking_id": tracking_id,
            "violation_type": saved_report.violation_type,
            "district": saved_report.location_district,
        }

        if new_status_val == "UNDER_REVIEW":
            notify_citizen(
                db, citizen_id,
                title="Report under review",
                message="A police officer is now reviewing your report.",
                notification_type="report_under_review",
                related_entity_type="evidence_report",
                related_entity_id=report_id,
                metadata=meta,
            )
        elif new_status_val == "VALIDATED":
            notify_citizen(
                db, citizen_id,
                title="Report validated",
                message="Your submitted report has been validated by police.",
                notification_type="report_validated",
                related_entity_type="evidence_report",
                related_entity_id=report_id,
                metadata=meta,
            )
            notify_admins(
                db,
                title="Report validated",
                message=f"Report {tracking_id} from {saved_report.location_district or 'an unspecified district'} has been validated by an officer.",
                notification_type="report_validated",
                related_entity_type="evidence_report",
                related_entity_id=report_id,
                priority="normal",
                metadata=meta,
            )
        elif new_status_val == "REJECTED":
            rejection_msg = (
                f"Your report has been rejected. Reason: {update.notes}"
                if update.notes
                else "Your report has been reviewed and rejected."
            )
            notify_citizen(
                db, citizen_id,
                title="Report rejected",
                message=rejection_msg,
                notification_type="report_rejected",
                related_entity_type="evidence_report",
                related_entity_id=report_id,
                metadata=meta,
            )
        db.commit()
    except Exception as _exc:
        import logging
        logging.getLogger(__name__).error("Notification dispatch failed after status update: %s", _exc)

    return present_evidence_report(saved_report)


@router.post("/{report_id}/rerun-inference", response_model=schemas.StaffEvidenceReportResponse)
def rerun_evidence_report_inference(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Evidence report not found")

    if report.status in {models.ReportStatusEnum.VALIDATED, models.ReportStatusEnum.CLOSED}:
        raise HTTPException(
            status_code=409,
            detail="Inference can only be re-run for reports that are still pending police review.",
        )

    try:
        attempt_inference(report, db, report_kind="evidence", attempt=1)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to re-run inference: {exc}") from exc

    refreshed_report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if refreshed_report is None:
        raise HTTPException(status_code=500, detail="Failed to reload the updated evidence report.")

    log_audit_action(
        db,
        current_user.id,
        "EVIDENCE_REPORT_INFERENCE_RERUN",
        "EvidenceReport",
        refreshed_report.id,
        details={
            "tracking_id": refreshed_report.tracking_id,
            "status": (
                refreshed_report.status.value
                if hasattr(refreshed_report.status, "value")
                else str(refreshed_report.status)
            ),
        },
    )

    return present_evidence_report(refreshed_report)


@router.put("/{report_id}/plate", response_model=schemas.StaffEvidenceReportResponse)
def update_evidence_report_plate(
    report_id: str,
    update: schemas.PlateCorrectionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_police),
):
    report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="Evidence report not found")

    normalized = normalize_sri_lankan_plate(update.corrected_plate_number)
    corrected_plate = normalized.normalized_text or normalized.compact_text
    if not corrected_plate:
        raise HTTPException(status_code=400, detail="Corrected plate number is empty after normalization.")

    previous_plate = report.vehicle_plate
    report.vehicle_plate = corrected_plate
    report.manual_review_required = bool(report.manual_review_required)

    inference_log = db.query(models.InferenceLog).filter(models.InferenceLog.evidence_report_id == report.id).first()
    if inference_log is not None:
        payload = dict(inference_log.bbox_coordinates or {})
        payload["manual_plate_correction"] = {
            "corrected_plate_number": corrected_plate,
            "submitted_text": update.corrected_plate_number,
            "previous_plate_number": previous_plate,
            "normalization_status": normalized.status,
            "corrected_by_user_id": current_user.id,
            "corrected_at": datetime.utcnow().isoformat(),
            "notes": update.notes,
        }
        payload["normalized_plate_text"] = corrected_plate
        payload["plate_text"] = payload.get("plate_text") or corrected_plate
        inference_log.bbox_coordinates = payload
        inference_log.ocr_text = corrected_plate

    log_audit_action(
        db,
        current_user.id,
        "EVIDENCE_REPORT_PLATE_CORRECTION",
        "EvidenceReport",
        report.id,
        details={
            "tracking_id": report.tracking_id,
            "previous_plate": previous_plate,
            "corrected_plate": corrected_plate,
            "normalization_status": normalized.status,
        },
    )
    db.commit()

    refreshed_report = _staff_report_query(db).filter(models.EvidenceReport.id == report_id).first()
    if refreshed_report is None:
        raise HTTPException(status_code=500, detail="Failed to reload the updated evidence report.")
    return present_evidence_report(refreshed_report)

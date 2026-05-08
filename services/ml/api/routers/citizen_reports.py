import uuid
from datetime import datetime, timedelta
from dataclasses import asdict
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..constants import SmsTemplateKeyEnum, StatusChangeSourceEnum
from ..database import get_db
from ..dependencies import get_current_citizen_account, log_audit_action
from ..presenters import present_citizen_evidence_report, present_citizen_report_detail
from ..sms import SmsSendRequest, render_sms_template
from ..tracking import apply_evidence_report_status
from ..tasks import submit_inference_task, submit_sms_task
from ..services.notifications import notify_citizen, notify_police, notify_admins

router = APIRouter(prefix="/api/citizen-reports", tags=["citizen-reports"])


def _citizen_report_query(db: Session):
    return db.query(models.EvidenceReport).options(
        joinedload(models.EvidenceReport.inference_log),
    )


@router.post("", response_model=schemas.CitizenEvidenceReportResponse)
@router.post("/", include_in_schema=False)
def create_citizen_report(
    report_data: schemas.CitizenEvidenceReportCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    primary_evidence = report_data.evidence[0]
    duplicate_cutoff = datetime.utcnow() - timedelta(minutes=10)
    duplicate_report = (
        db.query(models.EvidenceReport)
        .options(
            joinedload(models.EvidenceReport.files),
            joinedload(models.EvidenceReport.inference_log),
        )
        .join(models.EvidenceFile)
        .filter(
            models.EvidenceReport.citizen_id == current_citizen.id,
            models.EvidenceReport.violation_type == report_data.violation_type,
            models.EvidenceReport.incident_at == report_data.incident_at,
            models.EvidenceReport.location_lat == report_data.location_lat,
            models.EvidenceReport.location_lng == report_data.location_lng,
            models.EvidenceReport.created_at >= duplicate_cutoff,
            models.EvidenceFile.original_name == primary_evidence.name,
            models.EvidenceFile.size_bytes == primary_evidence.size,
        )
        .order_by(models.EvidenceReport.created_at.desc())
        .first()
    )
    if duplicate_report is not None:
        return present_citizen_evidence_report(duplicate_report)

    new_report = models.EvidenceReport(
        tracking_id=f"LEX-{datetime.now().year}-{str(uuid.uuid4())[:8].upper()}",
        citizen_id=current_citizen.id,
        violation_type=report_data.violation_type,
        incident_at=report_data.incident_at,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        location_city=report_data.location_city,
        location_district=report_data.location_district,
        description=report_data.description,
        custom_violation_description=report_data.custom_violation_description,
        manual_review_required=report_data.violation_type == "other",
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
        storage_backend = evidence_item.storage_backend or ("legacy" if evidence_item.url.startswith("data:") else "external")
        storage_path = evidence_item.storage_path
        if storage_backend == "local" and not storage_path and evidence_item.url.startswith("local://"):
            storage_path = evidence_item.url.replace("local://", "", 1)
        db.add(
            models.EvidenceFile(
                report_id=new_report.id,
                file_type=evidence_item.type,
                storage_url=evidence_item.url,
                original_name=evidence_item.name,
                mime_type=evidence_item.mime_type,
                size_bytes=evidence_item.size,
                storage_backend=storage_backend,
                storage_path=storage_path,
                checksum_sha256=evidence_item.checksum_sha256,
                access_metadata=evidence_item.access_metadata or {},
            )
        )

    db.commit()

    saved_report = (
        db.query(models.EvidenceReport)
        .options(
            joinedload(models.EvidenceReport.files),
            joinedload(models.EvidenceReport.inference_log),
        )
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
            "district": saved_report.location_district,
            "violation_type": saved_report.violation_type,
        },
    )

    # SMS delivery is best-effort. Failed provider/config issues are recorded in sms_notifications
    # by dispatch_sms(), but they must not roll back or fail the already-saved report submission.
    rendered_sms = render_sms_template(
        SmsTemplateKeyEnum.CITIZEN_REPORT_SUBMITTED_CONFIRMATION,
        report=saved_report,
        citizen=current_citizen,
    )
    submit_sms_task(
        background_tasks,
        asdict(SmsSendRequest(
            phone_number=current_citizen.phone_number,
            message_body=rendered_sms.message_body,
            template_key=rendered_sms.template_key.value,
            citizen_id=current_citizen.id,
            report_id=saved_report.id,
            metadata=rendered_sms.metadata,
        )),
    )

    # Run the same AI enrichment path used by legacy reports so police can
    # review citizen submissions with helmet + ANPR context in the queue.
    submit_inference_task(saved_report.id, background_tasks, report_kind="evidence")

    # In-app notifications — best-effort, never block the response.
    try:
        notify_citizen(
            db, current_citizen.id,
            title="Report submitted",
            message="Your traffic violation report has been submitted successfully. You will be notified as it progresses.",
            notification_type="report_submitted",
            related_entity_type="evidence_report",
            related_entity_id=saved_report.id,
            metadata={
                "tracking_id": saved_report.tracking_id,
                "district": saved_report.location_district,
            },
        )
        notify_police(
            db,
            title="New report submitted",
            message=f"A new citizen traffic violation report ({saved_report.tracking_id}) from {saved_report.location_district} is waiting for review.",
            notification_type="new_report_submitted",
            related_entity_type="evidence_report",
            related_entity_id=saved_report.id,
            priority="normal",
            metadata={
                "tracking_id": saved_report.tracking_id,
                "violation_type": saved_report.violation_type,
                "district": saved_report.location_district,
            },
        )
        db.commit()
    except Exception as _exc:
        import logging
        logging.getLogger(__name__).error("Notification dispatch failed after report submission: %s", _exc)

    return present_citizen_evidence_report(saved_report)


@router.get("/me", response_model=List[schemas.CitizenReportSummaryResponse])
def get_current_citizen_reports(
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    return (
        _citizen_report_query(db)
        .options(joinedload(models.EvidenceReport.files))
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
            joinedload(models.EvidenceReport.inference_log),
        )
        .filter(
            models.EvidenceReport.id == report_id,
            models.EvidenceReport.citizen_id == current_citizen.id,
        )
        .first()
    )

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citizen report not found")

    return present_citizen_report_detail(report)


@router.get("/tracking/{tracking_id}", response_model=schemas.CitizenEvidenceReportResponse)
def get_citizen_report_by_tracking_id(tracking_id: str, db: Session = Depends(get_db)):
    report = (
        _citizen_report_query(db)
        .options(
            joinedload(models.EvidenceReport.files),
            joinedload(models.EvidenceReport.inference_log),
        )
        .filter(models.EvidenceReport.tracking_id == tracking_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Citizen report not found")

    return present_citizen_evidence_report(report)

import csv
import time
from collections import defaultdict
from io import StringIO
from typing import Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from .. import models
from ..database import get_db
from ..dependencies import get_admin, log_audit_action
from ..locations import district_counts_payload
from ..services.evidence_storage import cleanup_orphaned_local_files
from ..tasks import get_queue_health

router = APIRouter(prefix="/api/admin", tags=["admin"])
_analytics_cache: dict[str, tuple[float, Any]] = {}
ANALYTICS_CACHE_SECONDS = 30


def _report_violation_expression():
    return func.coalesce(
        models.Report.violation_type,
        models.Report.inferred_violation_type,
        models.Report.claimed_violation_type,
        "unclassified",
    )


def _enum_value(value):
    return value.value if hasattr(value, "value") else str(value)


def _date_key(value) -> str:
    return str(value)


def _cache_get(key: str):
    cached = _analytics_cache.get(key)
    if not cached:
        return None
    expires_at, payload = cached
    if expires_at <= time.time():
        _analytics_cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: Any):
    _analytics_cache[key] = (time.time() + ANALYTICS_CACHE_SECONDS, payload)
    return payload

# --- AUDIT LOGS ---
@router.get("/audit-logs")
def get_audit_logs(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(100).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "details": log.details,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None
        })
    return result

@router.post("/configuration/ai-threshold")
def update_ai_threshold(threshold: float, db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    log_audit_action(db, current_user.id, "ADMIN_CONFIGURATION_CHANGE", "System", details={"ai_threshold": threshold})
    return {"message": "AI Threshold updated", "new_threshold": threshold}

# --- ANALYTICS ENDPOINTS (no caching - Redis not available) ---

@router.get("/analytics/reports-trend")
def get_reports_trend(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Reports per day across legacy and citizen evidence reports (last 30 days)."""
    cached = _cache_get("reports_trend")
    if cached is not None:
        return cached
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    legacy_rows = db.query(
        func.date(models.Report.datetime).label('date'),
        func.count(models.Report.id).label('count')
    ).filter(models.Report.datetime >= thirty_days_ago) \
     .group_by(func.date(models.Report.datetime)) \
     .all()

    evidence_rows = db.query(
        func.date(models.EvidenceReport.incident_at).label('date'),
        func.count(models.EvidenceReport.id).label('count')
    ).filter(models.EvidenceReport.incident_at >= thirty_days_ago) \
     .group_by(func.date(models.EvidenceReport.incident_at)) \
     .all()

    totals = defaultdict(int)
    for row in [*legacy_rows, *evidence_rows]:
        totals[_date_key(row.date)] += row.count

    return _cache_set("reports_trend", [{"date": date, "count": totals[date]} for date in sorted(totals)])

@router.get("/analytics/status-ratio")
def get_status_ratio(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Report counts by status across legacy and citizen evidence reports."""
    cached = _cache_get("status_ratio")
    if cached is not None:
        return cached
    legacy_rows = db.query(
        models.Report.status,
        func.count(models.Report.id).label('count')
    ).group_by(models.Report.status).all()

    evidence_rows = db.query(
        models.EvidenceReport.status,
        func.count(models.EvidenceReport.id).label('count')
    ).group_by(models.EvidenceReport.status).all()

    totals = defaultdict(int)
    for row in [*legacy_rows, *evidence_rows]:
        totals[_enum_value(row.status)] += row.count

    return _cache_set("status_ratio", [{"status": status, "count": totals[status]} for status in sorted(totals)])

@router.get("/analytics/violation-types")
def get_violation_types(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Bar chart violation payload across all report sources."""
    cached = _cache_get("violation_types")
    if cached is not None:
        return cached
    violation_expr = _report_violation_expression()
    legacy_rows = db.query(
        violation_expr.label("violation_type"),
        func.count(models.Report.id).label('count')
    ).group_by(violation_expr).all()

    evidence_rows = db.query(
        models.EvidenceReport.violation_type.label("violation_type"),
        func.count(models.EvidenceReport.id).label('count')
    ).group_by(models.EvidenceReport.violation_type).all()

    totals = defaultdict(int)
    for row in [*legacy_rows, *evidence_rows]:
        totals[row.violation_type or "unclassified"] += row.count

    return _cache_set("violation_types", [{"type": violation_type, "count": totals[violation_type]} for violation_type in sorted(totals)])

@router.get("/analytics/districts")
def get_district_analytics(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Report counts by Sri Lankan district across legacy and citizen evidence reports."""
    cached = _cache_get("districts")
    if cached is not None:
        return cached

    legacy_rows = db.query(
        models.Report.location_district.label("district"),
        func.count(models.Report.id).label("count"),
    ).filter(models.Report.location_district.isnot(None)) \
     .group_by(models.Report.location_district).all()

    evidence_rows = db.query(
        models.EvidenceReport.location_district.label("district"),
        func.count(models.EvidenceReport.id).label("count"),
    ).filter(models.EvidenceReport.location_district.isnot(None)) \
     .group_by(models.EvidenceReport.location_district).all()

    return _cache_set("districts", district_counts_payload([*legacy_rows, *evidence_rows]))

@router.get("/analytics/ai-metrics")
def get_ai_metrics(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Average AI confidence and average inference latency """
    cached = _cache_get("ai_metrics")
    if cached is not None:
        return cached
    query = db.query(
        func.avg(models.InferenceLog.confidence).label('avg_confidence'),
        func.avg(models.InferenceLog.ocr_confidence).label('avg_ocr_confidence'),
        func.avg(models.InferenceLog.inference_latency).label('avg_latency')
    ).first()
    
    return _cache_set("ai_metrics", {
        "avg_helmet_confidence": round(query.avg_confidence or 0, 4),
        "avg_ocr_confidence": round(query.avg_ocr_confidence or 0, 4),
        "avg_inference_latency_seconds": round(query.avg_latency or 0, 4)
    })


@router.get("/analytics/anpr-performance")
def get_anpr_performance(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ANPR quality counters from inference log payloads."""
    cached = _cache_get("anpr_performance")
    if cached is not None:
        return cached

    logs = db.query(models.InferenceLog).all()
    reports_with_plate_detected = 0
    ocr_succeeded = 0
    ocr_failed = 0
    manual_plate_correction_count = 0
    plate_confidences: list[float] = []
    ocr_confidences: list[float] = []

    for log in logs:
        payload = log.bbox_coordinates or {}
        anpr_output = payload.get("anpr_output") or {}
        plate_detected = bool(payload.get("plate_detected") or anpr_output.get("plate_detected"))
        normalized_plate_text = (
            payload.get("normalized_plate_text")
            or anpr_output.get("normalized_plate_text")
            or log.ocr_text
        )
        anpr_status = payload.get("anpr_status") or anpr_output.get("status")

        if plate_detected:
            reports_with_plate_detected += 1
        if normalized_plate_text:
            ocr_succeeded += 1
        elif plate_detected or anpr_status in {"ocr_failed", "no_plate", "model_missing", "failed"}:
            ocr_failed += 1

        if payload.get("manual_plate_correction"):
            manual_plate_correction_count += 1

        plate_conf = payload.get("plate_detection_confidence", payload.get("plate_confidence", anpr_output.get("plate_confidence")))
        ocr_conf = payload.get("ocr_confidence", anpr_output.get("ocr_confidence", log.ocr_confidence))
        if plate_conf is not None:
            try:
                plate_confidences.append(float(plate_conf))
            except (TypeError, ValueError):
                pass
        if ocr_conf is not None:
            try:
                ocr_confidences.append(float(ocr_conf))
            except (TypeError, ValueError):
                pass

    def _avg(values: list[float]) -> float:
        return round(sum(values) / len(values), 4) if values else 0.0

    return _cache_set(
        "anpr_performance",
        {
            "total_reports_with_plate_detected": reports_with_plate_detected,
            "ocr_succeeded": ocr_succeeded,
            "ocr_failed": ocr_failed,
            "avg_plate_detection_confidence": _avg(plate_confidences),
            "avg_ocr_confidence": _avg(ocr_confidences),
            "manual_plate_correction_count": manual_plate_correction_count,
        },
    )

# --- OFFICER PERFORMANCE METRICS ---

@router.get("/analytics/officers")
def get_officer_metrics(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Validations per officer and approval rates """
    decision_rows = db.query(
        models.AuditLog.user_id,
        func.count(models.AuditLog.id).label('total_decisions')
    ).filter(
        or_(
            models.AuditLog.action.like("REPORT_STATUS_UPDATE_TO_%"),
            models.AuditLog.action.like("EVIDENCE_REPORT_STATUS_UPDATE_TO_%"),
        )
    ) \
     .group_by(models.AuditLog.user_id).all()

    ticket_rows = db.query(
        models.TrafficTicket.officer_id,
        func.count(models.TrafficTicket.id).label("tickets_issued"),
    ).group_by(models.TrafficTicket.officer_id).all()
    tickets_by_officer = {officer_id: tickets_issued for officer_id, tickets_issued in ticket_rows}

    officers = []
    for user_id, total_decisions in decision_rows:
        issued_tickets = tickets_by_officer.get(user_id, 0)
        approval_rate = (issued_tickets / total_decisions) * 100 if total_decisions > 0 else 0
        
        officers.append({
            "officer_id": user_id,
            "total_validations": total_decisions,
            "tickets_issued": issued_tickets,
            "approval_rate_percent": round(approval_rate, 2),
        })
        
    return officers


@router.get("/worker/health")
def get_worker_health(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Queue and inference-job health for operations dashboards."""
    job_status_rows = db.query(
        models.InferenceJob.status,
        func.count(models.InferenceJob.id).label("count"),
    ).group_by(models.InferenceJob.status).all()
    recent_failed = db.query(models.InferenceJob).filter(
        models.InferenceJob.status == "failed",
    ).order_by(models.InferenceJob.failed_at.desc().nullslast(), models.InferenceJob.created_at.desc()).limit(10).all()

    return {
        "queue": get_queue_health(),
        "jobs_by_status": {status: count for status, count in job_status_rows},
        "recent_failed_jobs": [
            {
                "id": job.id,
                "report_id": job.report_id,
                "report_kind": job.report_kind,
                "attempts": job.attempts,
                "max_retries": job.max_retries,
                "last_error": job.last_error,
                "failed_at": job.failed_at.isoformat() if job.failed_at else None,
            }
            for job in recent_failed
        ],
    }


@router.get("/inference-jobs")
def list_inference_jobs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_admin),
):
    """Paginated job-status tracking for durable inference processing."""
    query = db.query(models.InferenceJob)
    if status_filter:
        query = query.filter(models.InferenceJob.status == status_filter.strip().lower())
    total = query.count()
    jobs = query.order_by(models.InferenceJob.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [
            {
                "id": job.id,
                "report_id": job.report_id,
                "report_kind": job.report_kind,
                "queue_backend": job.queue_backend,
                "queue_job_id": job.queue_job_id,
                "status": job.status,
                "attempts": job.attempts,
                "max_retries": job.max_retries,
                "last_error": job.last_error,
                "queued_at": job.queued_at.isoformat() if job.queued_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                "failed_at": job.failed_at.isoformat() if job.failed_at else None,
            }
            for job in jobs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/storage/cleanup")
def cleanup_storage_orphans(
    older_than_seconds: int = Query(24 * 60 * 60, ge=60, le=30 * 24 * 60 * 60),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_admin),
):
    """Delete local evidence files that are not referenced by evidence_files."""
    known_paths = {
        path
        for (path,) in db.query(models.EvidenceFile.storage_path)
        .filter(models.EvidenceFile.storage_backend == "local", models.EvidenceFile.storage_path.isnot(None))
        .all()
    }
    deleted = cleanup_orphaned_local_files(known_paths, older_than_seconds=older_than_seconds)
    log_audit_action(
        db,
        current_user.id,
        "ADMIN_STORAGE_CLEANUP",
        "EvidenceStorage",
        details={"deleted_files": deleted, "older_than_seconds": older_than_seconds},
    )
    return {"deleted_files": deleted, "known_storage_paths": len(known_paths)}

# --- HEATMAP STRUCTURE ---

@router.get("/analytics/heatmap")
def get_heatmap_data(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Aggregate validated report locations rounded to 3 decimal places."""
    cached = _cache_get("heatmap")
    if cached is not None:
        return cached
    reports = db.query(models.Report.location_lat, models.Report.location_lng) \
        .filter(models.Report.status == models.StatusEnum.VALIDATED).all()
    evidence_reports = db.query(models.EvidenceReport.location_lat, models.EvidenceReport.location_lng) \
        .filter(models.EvidenceReport.status == models.StatusEnum.VALIDATED).all()

    heatmap_grid = {}
    for lat, lng in [*reports, *evidence_reports]:
        if lat and lng:
            grid_lat = round(lat, 3)
            grid_lng = round(lng, 3)
            coord = f"{grid_lat},{grid_lng}"
            heatmap_grid[coord] = heatmap_grid.get(coord, 0) + 1
            
    return _cache_set("heatmap", [{"lat": float(c.split(',')[0]), "lng": float(c.split(',')[1]), "weight": w} for c, w in heatmap_grid.items()])

# --- CSV EXPORT ENDPOINTS ---

@router.get("/export/reports")
def export_reports_csv(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Export legacy and citizen evidence reports via CSV stream."""
    legacy_reports = db.query(models.Report).all()
    evidence_reports = db.query(models.EvidenceReport).options(joinedload(models.EvidenceReport.inference_log)).all()

    def iter_csv():
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                'ID',
                'Source',
                'TrackingID',
                'ClaimedViolationType',
                'InferredViolationType',
                'FinalViolationType',
                'DateTime',
                'Status',
                'Lat',
                'Lng',
                'City',
                'District',
                'CustomViolationDescription',
                'ManualReviewRequired',
            ]
        )

        for r in legacy_reports:
            writer.writerow(
                [
                    r.id,
                    "legacy_report",
                    r.tracking_id,
                    r.claimed_violation_type,
                    r.inferred_violation_type,
                    r.violation_type,
                    r.datetime,
                    _enum_value(r.status),
                    r.location_lat,
                    r.location_lng,
                    r.location_city,
                    r.location_district,
                    r.custom_violation_description,
                    r.manual_review_required,
                ]
            )
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

        for r in evidence_reports:
            inferred_violation = r.inference_log.bbox_coordinates.get("inferred_violation_type") if r.inference_log else None
            writer.writerow(
                [
                    r.id,
                    "evidence_report",
                    r.tracking_id,
                    r.violation_type,
                    inferred_violation,
                    r.violation_type if _enum_value(r.status) in {"VALIDATED", "CLOSED"} else None,
                    r.incident_at,
                    _enum_value(r.status),
                    r.location_lat,
                    r.location_lng,
                    r.location_city,
                    r.location_district,
                    r.custom_violation_description,
                    r.manual_review_required,
                ]
            )
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)
            
    response = StreamingResponse(iter_csv(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=lexvision_reports_export.csv"
    return response

@router.get("/export/analytics-summary")
def export_analytics_summary_csv(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Export global system aggregated data """
    query = db.query(
        func.avg(models.InferenceLog.confidence).label('avg_confidence'),
        func.avg(models.InferenceLog.ocr_confidence).label('avg_ocr_confidence'),
        func.avg(models.InferenceLog.inference_latency).label('avg_latency')
    ).first()
    
    def iter_csv():
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Metric', 'Value'])
        writer.writerow(['Avg Helmet Confidence', round(query.avg_confidence or 0, 4)])
        writer.writerow(['Avg OCR Confidence', round(query.avg_ocr_confidence or 0, 4)])
        writer.writerow(['Avg Inference Latency (s)', round(query.avg_latency or 0, 4)])
        yield output.getvalue()
        
    response = StreamingResponse(iter_csv(), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=lexvision_analytics_summary.csv"
    return response

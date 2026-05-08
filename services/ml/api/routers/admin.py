import os
import json
import csv
from collections import defaultdict
from io import StringIO
from typing import List, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_admin, log_audit_action

router = APIRouter(prefix="/api/admin", tags=["admin"])


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

    return [{"date": date, "count": totals[date]} for date in sorted(totals)]

@router.get("/analytics/status-ratio")
def get_status_ratio(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Report counts by status across legacy and citizen evidence reports."""
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

    return [{"status": status, "count": totals[status]} for status in sorted(totals)]

@router.get("/analytics/violation-types")
def get_violation_types(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Bar chart violation payload across all report sources."""
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

    return [{"type": violation_type, "count": totals[violation_type]} for violation_type in sorted(totals)]

@router.get("/analytics/ai-metrics")
def get_ai_metrics(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Average AI confidence and average inference latency """
    query = db.query(
        func.avg(models.InferenceLog.confidence).label('avg_confidence'),
        func.avg(models.InferenceLog.ocr_confidence).label('avg_ocr_confidence'),
        func.avg(models.InferenceLog.inference_latency).label('avg_latency')
    ).first()
    
    return {
        "avg_helmet_confidence": round(query.avg_confidence or 0, 4),
        "avg_ocr_confidence": round(query.avg_ocr_confidence or 0, 4),
        "avg_inference_latency_seconds": round(query.avg_latency or 0, 4)
    }

# --- OFFICER PERFORMANCE METRICS ---

@router.get("/analytics/officers")
def get_officer_metrics(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Validations per officer and approval rates """
    query = db.query(
        models.AuditLog.user_id,
        func.count(models.AuditLog.id).label('total_decisions')
    ).filter(
        or_(
            models.AuditLog.action.like("REPORT_STATUS_UPDATE_TO_%"),
            models.AuditLog.action.like("EVIDENCE_REPORT_STATUS_UPDATE_TO_%"),
        )
    ) \
     .group_by(models.AuditLog.user_id).all()
     
    officers = []
    for user_id, total_decisions in query:
        issued_tickets = db.query(func.count(models.TrafficTicket.id)).filter(models.TrafficTicket.officer_id == user_id).scalar()
        approval_rate = (issued_tickets / total_decisions) * 100 if total_decisions > 0 else 0
        
        officers.append({
            "officer_id": user_id,
            "total_validations": total_decisions,
            "tickets_issued": issued_tickets,
            "approval_rate_percent": round(approval_rate, 2),
        })
        
    return officers

# --- HEATMAP STRUCTURE ---

@router.get("/analytics/heatmap")
def get_heatmap_data(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """Aggregate validated report locations rounded to 3 decimal places."""
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
            
    return [{"lat": float(c.split(',')[0]), "lng": float(c.split(',')[1]), "weight": w} for c, w in heatmap_grid.items()]

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

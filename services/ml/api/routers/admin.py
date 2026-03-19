import os
import json
import csv
from io import StringIO
from typing import List, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_, desc

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_admin, log_audit_action

router = APIRouter(prefix="/api/admin", tags=["admin"])

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
    """ Reports per day (Last 30 days) """
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    query = db.query(
        func.date(models.Report.datetime).label('date'),
        func.count(models.Report.id).label('count')
    ).filter(models.Report.datetime >= thirty_days_ago) \
     .group_by(func.date(models.Report.datetime)) \
     .order_by('date').all()
     
    return [{"date": str(q.date), "count": q.count} for q in query]

@router.get("/analytics/status-ratio")
def get_status_ratio(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Report counts by status """
    query = db.query(
        models.Report.status,
        func.count(models.Report.id).label('count')
    ).group_by(models.Report.status).all()
    
    # Convert enum to plain string for JSON serialization
    return [{"status": str(q.status.value) if hasattr(q.status, 'value') else str(q.status), "count": q.count} for q in query]

@router.get("/analytics/violation-types")
def get_violation_types(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Bar chart violation payload """
    query = db.query(
        models.Report.violation_type,
        func.count(models.Report.id).label('count')
    ).group_by(models.Report.violation_type).all()
    
    return [{"type": q.violation_type, "count": q.count} for q in query]

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
    ).filter(models.AuditLog.action.like("REPORT_STATUS_UPDATE_TO_%")) \
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
    """ Aggregate by location rounded to 3 decimal places """
    reports = db.query(models.Report.location_lat, models.Report.location_lng)\
                .filter(models.Report.status == models.StatusEnum.VALIDATED).all()
                
    heatmap_grid = {}
    for lat, lng in reports:
        if lat and lng:
            grid_lat = round(lat, 3)
            grid_lng = round(lng, 3)
            coord = f"{grid_lat},{grid_lng}"
            heatmap_grid[coord] = heatmap_grid.get(coord, 0) + 1
            
    return [{"lat": float(c.split(',')[0]), "lng": float(c.split(',')[1]), "weight": w} for c, w in heatmap_grid.items()]

# --- CSV EXPORT ENDPOINTS ---

@router.get("/export/reports")
def export_reports_csv(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    """ Export reports via CSV Stream """
    reports = db.query(models.Report).all()
    
    def iter_csv():
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['ID', 'TrackingID', 'ViolationType', 'DateTime', 'Status', 'Lat', 'Lng', 'City'])
        
        for r in reports:
            status_val = r.status.value if hasattr(r.status, 'value') else str(r.status)
            writer.writerow([r.id, r.tracking_id, r.violation_type, r.datetime, status_val, r.location_lat, r.location_lng, r.location_city])
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

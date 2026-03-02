from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_admin, log_audit_action

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/audit-logs")
def get_audit_logs(db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(100).all()
    # Pydantic schemas can be added, returning plain JSON for now
    return logs

@router.post("/configuration/ai-threshold")
def update_ai_threshold(threshold: float, db: Session = Depends(get_db), current_user: models.User = Depends(get_admin)):
    # Fake setting update
    log_audit_action(db, current_user.id, "ADMIN_CONFIGURATION_CHANGE", "System", details={"ai_threshold": threshold})
    return {"message": "AI Threshold updated", "new_threshold": threshold}

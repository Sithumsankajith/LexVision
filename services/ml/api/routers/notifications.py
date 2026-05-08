"""Notification endpoints.

Two separate router prefixes keep the auth models clean:
  /api/notifications          — police / admin (staff JWT, email sub)
  /api/citizen-notifications  — citizens (citizen JWT, citizen_id sub)
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, get_current_citizen_account
from ..services.notifications import mark_notification_read, mark_all_notifications_read

# ---------------------------------------------------------------------------
# Staff router — police + admin
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _staff_notifications_query(
    db: Session,
    user_id: str,
    *,
    unread_only: bool = False,
    notification_type: Optional[str] = None,
):
    query = db.query(models.Notification).filter(
        models.Notification.recipient_user_id == user_id,
        models.Notification.is_deleted == False,
    )
    if unread_only:
        query = query.filter(models.Notification.is_read == False)
    if notification_type:
        query = query.filter(models.Notification.notification_type == notification_type)
    return query.order_by(models.Notification.created_at.desc())


@router.get("", response_model=schemas.NotificationListResponse)
@router.get("/", include_in_schema=False)
def list_staff_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    notification_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    base = _staff_notifications_query(
        db, current_user.id,
        unread_only=unread_only,
        notification_type=notification_type,
    )
    total = base.count()
    items = base.offset(offset).limit(limit).all()
    unread_count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_user_id == current_user.id,
            models.Notification.is_read == False,
            models.Notification.is_deleted == False,
        )
        .count()
    )
    return {"items": items, "total": total, "unread_count": unread_count}


@router.get("/unread-count", response_model=schemas.UnreadCountResponse)
def staff_unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_user_id == current_user.id,
            models.Notification.is_read == False,
            models.Notification.is_deleted == False,
        )
        .count()
    )
    return {"count": count}


@router.patch("/read-all")
def staff_mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    count = mark_all_notifications_read(db, user_id=current_user.id)
    db.commit()
    return {"marked_read": count}


@router.patch("/{notification_id}/read", response_model=schemas.NotificationResponse)
def staff_mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ok = mark_notification_read(db, notification_id, user_id=current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found.")
    db.commit()
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id
    ).first()
    return notification


@router.delete("/{notification_id}")
def staff_delete_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notification.is_deleted = True
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Citizen router
# ---------------------------------------------------------------------------

citizen_router = APIRouter(prefix="/api/citizen-notifications", tags=["citizen-notifications"])


def _citizen_notifications_query(
    db: Session,
    citizen_id: str,
    *,
    unread_only: bool = False,
    notification_type: Optional[str] = None,
):
    query = db.query(models.Notification).filter(
        models.Notification.recipient_citizen_id == citizen_id,
        models.Notification.is_deleted == False,
    )
    if unread_only:
        query = query.filter(models.Notification.is_read == False)
    if notification_type:
        query = query.filter(models.Notification.notification_type == notification_type)
    return query.order_by(models.Notification.created_at.desc())


@citizen_router.get("", response_model=schemas.NotificationListResponse)
@citizen_router.get("/", include_in_schema=False)
def list_citizen_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    notification_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    base = _citizen_notifications_query(
        db, current_citizen.id,
        unread_only=unread_only,
        notification_type=notification_type,
    )
    total = base.count()
    items = base.offset(offset).limit(limit).all()
    unread_count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_citizen_id == current_citizen.id,
            models.Notification.is_read == False,
            models.Notification.is_deleted == False,
        )
        .count()
    )
    return {"items": items, "total": total, "unread_count": unread_count}


@citizen_router.get("/unread-count", response_model=schemas.UnreadCountResponse)
def citizen_unread_count(
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    count = (
        db.query(models.Notification)
        .filter(
            models.Notification.recipient_citizen_id == current_citizen.id,
            models.Notification.is_read == False,
            models.Notification.is_deleted == False,
        )
        .count()
    )
    return {"count": count}


@citizen_router.patch("/read-all")
def citizen_mark_all_read(
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    count = mark_all_notifications_read(db, citizen_id=current_citizen.id)
    db.commit()
    return {"marked_read": count}


@citizen_router.patch("/{notification_id}/read", response_model=schemas.NotificationResponse)
def citizen_mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    ok = mark_notification_read(db, notification_id, citizen_id=current_citizen.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found.")
    db.commit()
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id
    ).first()
    return notification


@citizen_router.delete("/{notification_id}")
def citizen_delete_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    current_citizen: models.Citizen = Depends(get_current_citizen_account),
):
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_citizen_id == current_citizen.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notification.is_deleted = True
    db.commit()
    return {"deleted": True}

"""Centralised in-app notification service.

All functions are best-effort: they catch and log exceptions so that a
notification failure never breaks the primary workflow that triggered it.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    *,
    recipient_role: str,
    title: str,
    message: str,
    notification_type: str,
    recipient_user_id: Optional[str] = None,
    recipient_citizen_id: Optional[str] = None,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "normal",
    metadata: Optional[dict] = None,
) -> Optional[models.Notification]:
    try:
        notification = models.Notification(
            recipient_role=recipient_role,
            title=title,
            message=message,
            notification_type=notification_type,
            recipient_user_id=recipient_user_id,
            recipient_citizen_id=recipient_citizen_id,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            priority=priority,
            extra_data=metadata,
        )
        db.add(notification)
        db.flush()
        return notification
    except Exception as exc:
        logger.error("Notification creation failed: %s", exc, exc_info=True)
        return None


def notify_citizen(
    db: Session,
    citizen_id: str,
    *,
    title: str,
    message: str,
    notification_type: str,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "normal",
    metadata: Optional[dict] = None,
) -> Optional[models.Notification]:
    return create_notification(
        db,
        recipient_role="CITIZEN",
        title=title,
        message=message,
        notification_type=notification_type,
        recipient_citizen_id=citizen_id,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        priority=priority,
        metadata=metadata,
    )


def notify_police(
    db: Session,
    *,
    title: str,
    message: str,
    notification_type: str,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "normal",
    metadata: Optional[dict] = None,
) -> List[models.Notification]:
    return notify_role(
        db,
        role="POLICE",
        title=title,
        message=message,
        notification_type=notification_type,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        priority=priority,
        metadata=metadata,
    )


def notify_admins(
    db: Session,
    *,
    title: str,
    message: str,
    notification_type: str,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "high",
    metadata: Optional[dict] = None,
) -> List[models.Notification]:
    return notify_role(
        db,
        role="ADMIN",
        title=title,
        message=message,
        notification_type=notification_type,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        priority=priority,
        metadata=metadata,
    )


def notify_role(
    db: Session,
    role: str,
    *,
    title: str,
    message: str,
    notification_type: str,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    priority: str = "normal",
    metadata: Optional[dict] = None,
) -> List[models.Notification]:
    try:
        users = db.query(models.User).filter(models.User.role == role).all()
        notifications: List[models.Notification] = []
        for user in users:
            n = create_notification(
                db,
                recipient_role=role,
                title=title,
                message=message,
                notification_type=notification_type,
                recipient_user_id=user.id,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
                priority=priority,
                metadata=metadata,
            )
            if n is not None:
                notifications.append(n)
        return notifications
    except Exception as exc:
        logger.error("notify_role(%s) failed: %s", role, exc, exc_info=True)
        return []


def mark_notification_read(
    db: Session,
    notification_id: str,
    *,
    user_id: Optional[str] = None,
    citizen_id: Optional[str] = None,
) -> bool:
    try:
        query = db.query(models.Notification).filter(
            models.Notification.id == notification_id,
            models.Notification.is_deleted == False,
        )
        if user_id:
            query = query.filter(models.Notification.recipient_user_id == user_id)
        elif citizen_id:
            query = query.filter(models.Notification.recipient_citizen_id == citizen_id)
        notification = query.first()
        if not notification:
            return False
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.flush()
        return True
    except Exception as exc:
        logger.error("mark_notification_read failed: %s", exc, exc_info=True)
        return False


def mark_all_notifications_read(
    db: Session,
    *,
    user_id: Optional[str] = None,
    citizen_id: Optional[str] = None,
) -> int:
    try:
        query = db.query(models.Notification).filter(
            models.Notification.is_read == False,
            models.Notification.is_deleted == False,
        )
        if user_id:
            query = query.filter(models.Notification.recipient_user_id == user_id)
        elif citizen_id:
            query = query.filter(models.Notification.recipient_citizen_id == citizen_id)
        count = query.count()
        query.update({"is_read": True, "read_at": datetime.utcnow()}, synchronize_session=False)
        db.flush()
        return count
    except Exception as exc:
        logger.error("mark_all_notifications_read failed: %s", exc, exc_info=True)
        return 0

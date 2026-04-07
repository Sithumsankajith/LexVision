from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from . import models
from .firebase_admin import verify_firebase_id_token


class CitizenAuthError(RuntimeError):
    """Raised when a Firebase-authenticated citizen request is invalid."""


class CitizenAccountConflictError(CitizenAuthError):
    """Raised when the Firebase UID and phone number map to different citizens."""


def verify_citizen_firebase_identity(id_token: str) -> dict[str, Any]:
    decoded_token = verify_firebase_id_token(id_token, check_revoked=True)

    firebase_claims = decoded_token.get("firebase")
    sign_in_provider = firebase_claims.get("sign_in_provider") if isinstance(firebase_claims, dict) else None
    if sign_in_provider != "phone":
        raise CitizenAuthError("Firebase token must come from phone authentication.")

    firebase_uid = decoded_token.get("uid") or decoded_token.get("user_id") or decoded_token.get("sub")
    if not isinstance(firebase_uid, str) or not firebase_uid.strip():
        raise CitizenAuthError("Firebase token is missing a valid user identifier.")

    phone_number = decoded_token.get("phone_number")
    if not isinstance(phone_number, str) or not phone_number.strip():
        raise CitizenAuthError("Firebase token is missing a verified phone number.")

    return {
        "firebase_uid": firebase_uid.strip(),
        "phone_number": phone_number.strip(),
        "claims": decoded_token,
    }


def get_or_create_citizen_account(db: Session, *, firebase_uid: str, phone_number: str) -> models.Citizen:
    citizen_by_uid = db.query(models.Citizen).filter(models.Citizen.firebase_uid == firebase_uid).first()
    citizen_by_phone = db.query(models.Citizen).filter(models.Citizen.phone_number == phone_number).first()

    if citizen_by_uid and citizen_by_phone and citizen_by_uid.id != citizen_by_phone.id:
        raise CitizenAccountConflictError(
            "Citizen account conflict detected for the provided Firebase UID and phone number."
        )

    citizen = citizen_by_uid or citizen_by_phone
    now = datetime.utcnow()

    if citizen is None:
        citizen = models.Citizen(
            firebase_uid=firebase_uid,
            phone_number=phone_number,
            verified_at=now,
        )
        db.add(citizen)
    else:
        citizen.firebase_uid = firebase_uid
        citizen.phone_number = phone_number
        citizen.verified_at = now

    db.commit()
    db.refresh(citizen)
    return citizen

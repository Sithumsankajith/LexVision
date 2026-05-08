from __future__ import annotations

import base64
import json
import os
import time
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from . import models
from .firebase_admin import FirebaseAdminConfigError, verify_firebase_id_token


class CitizenAuthError(RuntimeError):
    """Raised when a Firebase-authenticated citizen request is invalid."""


class CitizenAccountConflictError(CitizenAuthError):
    """Raised when the Firebase UID and phone number map to different citizens."""


def normalize_sri_lankan_phone_number(phone_number: str) -> str:
    digits = "".join(char for char in phone_number if char.isdigit())
    subscriber_digits = ""

    if len(digits) == 10 and digits.startswith("0"):
        subscriber_digits = digits[1:]
    elif len(digits) == 11 and digits.startswith("94"):
        subscriber_digits = digits[2:]
    elif len(digits) == 9 and digits.startswith("7"):
        subscriber_digits = digits

    if len(subscriber_digits) != 9 or not subscriber_digits.startswith("7"):
        raise CitizenAuthError("Enter a valid Sri Lankan mobile number, for example 0712345678 or +94712345678.")

    return f"+94{subscriber_digits}"


def _is_firebase_auth_dev_mode_enabled() -> bool:
    return os.getenv("FIREBASE_AUTH_DEV_MODE", "false").lower() == "true"


def _decode_unverified_jwt_claims(id_token: str) -> dict[str, Any]:
    token_parts = id_token.split(".")
    if len(token_parts) != 3:
        raise CitizenAuthError("Invalid Firebase ID token.")

    payload = token_parts[1]
    payload += "=" * (-len(payload) % 4)

    try:
        decoded_payload = base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        parsed_payload = json.loads(decoded_payload)
    except (ValueError, json.JSONDecodeError) as exc:
        raise CitizenAuthError("Invalid Firebase ID token.") from exc

    if not isinstance(parsed_payload, dict):
        raise CitizenAuthError("Invalid Firebase ID token.")

    return parsed_payload


def _verify_firebase_id_token_with_dev_fallback(id_token: str) -> dict[str, Any]:
    try:
        return verify_firebase_id_token(id_token, check_revoked=True)
    except FirebaseAdminConfigError:
        if not _is_firebase_auth_dev_mode_enabled():
            raise

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise FirebaseAdminConfigError(
            "FIREBASE_AUTH_DEV_MODE requires FIREBASE_PROJECT_ID so the token audience can be checked."
        )

    decoded_token = _decode_unverified_jwt_claims(id_token)
    issuer = decoded_token.get("iss")
    audience = decoded_token.get("aud")
    expected_issuer = f"https://securetoken.google.com/{project_id}"

    if issuer != expected_issuer or audience != project_id:
        raise CitizenAuthError("Firebase token does not match the configured project.")

    now = int(time.time())
    expires_at = decoded_token.get("exp")
    issued_at = decoded_token.get("iat")

    if not isinstance(expires_at, int) or expires_at <= now:
        raise CitizenAuthError("Firebase token has expired.")

    if isinstance(issued_at, int) and issued_at > now + 60:
        raise CitizenAuthError("Firebase token is not valid yet.")

    return decoded_token


def verify_citizen_firebase_identity(id_token: str, *, expected_phone_number: str | None = None) -> dict[str, Any]:
    decoded_token = _verify_firebase_id_token_with_dev_fallback(id_token)

    firebase_claims = decoded_token.get("firebase")
    sign_in_provider = firebase_claims.get("sign_in_provider") if isinstance(firebase_claims, dict) else None
    if sign_in_provider != "phone":
        raise CitizenAuthError("Firebase token must come from phone authentication.")

    firebase_uid = decoded_token.get("uid") or decoded_token.get("user_id") or decoded_token.get("sub")
    if not isinstance(firebase_uid, str) or not firebase_uid.strip():
        raise CitizenAuthError("Firebase token is missing a valid user identifier.")

    raw_phone_number = decoded_token.get("phone_number")
    if not isinstance(raw_phone_number, str) or not raw_phone_number.strip():
        raise CitizenAuthError("Firebase token is missing a verified phone number.")

    phone_number = normalize_sri_lankan_phone_number(raw_phone_number)

    if expected_phone_number is not None:
        normalized_expected_phone = normalize_sri_lankan_phone_number(expected_phone_number)
        if normalized_expected_phone != phone_number:
            raise CitizenAuthError("The verified Firebase phone number does not match the submitted phone number.")

    return {
        "firebase_uid": firebase_uid.strip(),
        "phone_number": phone_number,
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

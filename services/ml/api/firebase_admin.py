from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    from firebase_admin import credentials
except ImportError as exc:  # pragma: no cover - exercised after dependency install
    firebase_admin = None  # type: ignore[assignment]
    firebase_auth = None  # type: ignore[assignment]
    credentials = None  # type: ignore[assignment]
    _firebase_import_error = exc
else:
    _firebase_import_error = None


class FirebaseAdminConfigError(RuntimeError):
    """Raised when Firebase Admin is not configured correctly."""


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise FirebaseAdminConfigError(f"Missing required Firebase Admin environment variable: {name}")
    return value


@lru_cache
def get_firebase_admin_settings() -> dict[str, str]:
    return {
        "project_id": _require_env("FIREBASE_PROJECT_ID"),
        "client_email": _require_env("FIREBASE_CLIENT_EMAIL"),
        "private_key": _require_env("FIREBASE_PRIVATE_KEY").replace("\\n", "\n"),
    }


def is_firebase_admin_configured() -> bool:
    try:
        get_firebase_admin_settings()
    except FirebaseAdminConfigError:
        return False
    return True


@lru_cache
def get_firebase_admin_app():
    if _firebase_import_error is not None:
        raise FirebaseAdminConfigError(
            "firebase-admin is not installed. Run `pip install -r services/ml/requirements.txt`."
        ) from _firebase_import_error

    try:
        return firebase_admin.get_app()
    except ValueError:
        settings = get_firebase_admin_settings()
        certificate = credentials.Certificate(
            {
                "type": "service_account",
                "project_id": settings["project_id"],
                "client_email": settings["client_email"],
                "private_key": settings["private_key"],
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        )
        return firebase_admin.initialize_app(certificate, {"projectId": settings["project_id"]})


def get_firebase_auth_client():
    get_firebase_admin_app()
    return firebase_auth


def verify_firebase_id_token(id_token: str, *, check_revoked: bool = False) -> dict[str, Any]:
    if not id_token or not id_token.strip():
        raise FirebaseAdminConfigError("Firebase ID token is required.")

    auth_client = get_firebase_auth_client()
    return auth_client.verify_id_token(id_token, check_revoked=check_revoked)


def get_verified_phone_number(id_token: str) -> str | None:
    decoded_token = verify_firebase_id_token(id_token)
    phone_number = decoded_token.get("phone_number")
    if isinstance(phone_number, str) and phone_number.strip():
        return phone_number
    return None

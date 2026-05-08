import base64
import json
import time


def _encode_token_part(payload: dict) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("utf-8")
    return encoded.rstrip("=")


def _build_fake_firebase_phone_token(
    *,
    phone_number: str = "+94712345678",
    uid: str = "firebase-uid-123",
    project_id: str = "lexvision-f40aa",
) -> str:
    header = {"alg": "none", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "aud": project_id,
        "iss": f"https://securetoken.google.com/{project_id}",
        "sub": uid,
        "uid": uid,
        "phone_number": phone_number,
        "iat": now - 60,
        "exp": now + 3600,
        "firebase": {
            "sign_in_provider": "phone",
        },
    }
    return f"{_encode_token_part(header)}.{_encode_token_part(payload)}.signature"


def test_firebase_phone_login_uses_dev_mode_fallback_when_admin_is_missing(client, db_session, monkeypatch):
    monkeypatch.setenv("FIREBASE_AUTH_DEV_MODE", "true")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "lexvision-f40aa")
    monkeypatch.delenv("FIREBASE_CLIENT_EMAIL", raising=False)
    monkeypatch.delenv("FIREBASE_PRIVATE_KEY", raising=False)

    response = client.post(
        "/api/auth/firebase-phone-login",
        json={
            "firebase_id_token": _build_fake_firebase_phone_token(),
            "phone_number": "0712345678",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["role"] == "CITIZEN"
    assert payload["user"]["phone_number"] == "+94712345678"
    assert payload["citizen"]["phone_number"] == "+94712345678"


def test_firebase_phone_login_rejects_phone_mismatch_in_dev_mode(client, monkeypatch):
    monkeypatch.setenv("FIREBASE_AUTH_DEV_MODE", "true")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "lexvision-f40aa")
    monkeypatch.delenv("FIREBASE_CLIENT_EMAIL", raising=False)
    monkeypatch.delenv("FIREBASE_PRIVATE_KEY", raising=False)

    response = client.post(
        "/api/auth/firebase-phone-login",
        json={
            "firebase_id_token": _build_fake_firebase_phone_token(phone_number="+94712345678"),
            "phone_number": "+94770000000",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "The verified Firebase phone number does not match the submitted phone number."


def test_firebase_phone_login_requires_admin_or_dev_mode(client, monkeypatch):
    monkeypatch.setenv("FIREBASE_AUTH_DEV_MODE", "false")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "lexvision-f40aa")
    monkeypatch.delenv("FIREBASE_CLIENT_EMAIL", raising=False)
    monkeypatch.delenv("FIREBASE_PRIVATE_KEY", raising=False)

    response = client.post(
        "/api/auth/firebase-phone-login",
        json={
            "firebase_id_token": _build_fake_firebase_phone_token(),
            "phone_number": "+94771234567",
        },
    )

    assert response.status_code == 503

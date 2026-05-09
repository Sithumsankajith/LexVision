from datetime import timedelta

from api import models
from api.dependencies import create_citizen_access_token
from api.routers.auth import get_password_hash


def test_citizen_email_login_returns_token(client, db_session):
    user = models.User(
        email="citizen_email@test.com",
        hashed_password=get_password_hash("secret123"),
        role=models.RoleEnum.CITIZEN,
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/api/auth/login",
        data={
            "username": "citizen_email@test.com",
            "password": "secret123",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["token_type"] == "bearer"


def test_citizen_email_report_is_visible_to_police_queue(client, citizen_token, police_token):
    submit_response = client.post(
        "/api/citizen-reports",
        json={
            "violation_type": "helmet",
            "incident_at": "2026-04-30T10:00:00Z",
            "location_lat": 6.9271,
            "location_lng": 79.8612,
            "location_address": "Colombo Fort",
            "location_city": "Colombo",
            "location_district": "Colombo",
            "description": "Citizen submission",
            "vehicle_plate": "ABC-1234",
            "vehicle_type": "motorbike",
            "evidence": [{
                "type": "image",
                "url": "data:image/png;base64,ZmFrZQ==",
                "name": "helmet.png",
                "size": 1234,
                "mime_type": "image/png",
            }],
        },
        headers={"Authorization": f"Bearer {citizen_token}"},
    )
    assert submit_response.status_code == 200
    created_report = submit_response.json()

    queue_response = client.get(
        "/api/evidence-reports",
        headers={"Authorization": f"Bearer {police_token}"},
    )
    assert queue_response.status_code == 200

    queue_reports = queue_response.json()
    assert any(report["id"] == created_report["id"] for report in queue_reports)
    assert any(report["tracking_id"] == created_report["tracking_id"] for report in queue_reports)


def test_citizen_report_submission_requires_authentication(client):
    response = client.post(
        "/api/citizen-reports",
        json={
            "violation_type": "helmet",
            "incident_at": "2026-04-30T10:00:00Z",
            "location_lat": 6.9271,
            "location_lng": 79.8612,
            "location_address": "Colombo Fort",
            "location_city": "Colombo",
            "location_district": "Colombo",
            "description": "Unauthenticated submission",
            "vehicle_plate": "ABC-1234",
            "vehicle_type": "motorbike",
            "evidence": [{
                "type": "image",
                "url": "data:image/png;base64,ZmFrZQ==",
                "name": "helmet.png",
                "size": 1234,
                "mime_type": "image/png",
            }],
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["message"] == "Authentication required to submit reports."


def test_citizen_report_submission_rejects_expired_token(client, citizen_user):
    expired_token = create_citizen_access_token(citizen_user, expires_delta=timedelta(seconds=-1))

    response = client.post(
        "/api/citizen-reports",
        json={
            "violation_type": "helmet",
            "incident_at": "2026-04-30T10:00:00Z",
            "location_lat": 6.9271,
            "location_lng": 79.8612,
            "location_address": "Colombo Fort",
            "location_city": "Colombo",
            "location_district": "Colombo",
            "description": "Expired-token submission",
            "vehicle_plate": "ABC-1234",
            "vehicle_type": "motorbike",
            "evidence": [{
                "type": "image",
                "url": "data:image/png;base64,ZmFrZQ==",
                "name": "helmet.png",
                "size": 1234,
                "mime_type": "image/png",
            }],
        },
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]["message"] == "Authentication required to submit reports."

def test_demo_citizen_report_is_visible_to_police_queue(client, police_token, monkeypatch):
    monkeypatch.setenv("DEMO_OTP_ENABLED", "true")

    login_response = client.post("/api/auth/citizen/demo-login", json={
        "phone_number": "+94771234567",
    })
    assert login_response.status_code == 200
    citizen_token = login_response.json()["access_token"]

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
            "description": "Demo citizen submission",
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


def test_demo_citizen_login_is_disabled_without_backend_flag(client, monkeypatch):
    monkeypatch.setenv("DEMO_OTP_ENABLED", "false")

    response = client.post("/api/auth/citizen/demo-login", json={
        "phone_number": "+94771234567",
    })

    assert response.status_code == 404

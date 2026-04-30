from datetime import datetime, timezone

from api import models
from api.constants import ReportStatusEnum
from api.dependencies import create_citizen_access_token


def test_citizen_report_submission_queues_evidence_inference(client, citizen_user, monkeypatch):
    queued_jobs: list[tuple[str, str]] = []

    def fake_submit_inference_task(report_id, background_tasks, report_kind="legacy"):
        queued_jobs.append((report_id, report_kind))
        return f"task-{report_id}"

    monkeypatch.setattr("api.routers.citizen_reports.submit_inference_task", fake_submit_inference_task)

    citizen_token = create_citizen_access_token(citizen_user)
    response = client.post(
        "/api/citizen-reports",
        json={
            "violation_type": "helmet",
            "incident_at": "2026-04-30T10:00:00Z",
            "location_lat": 6.9271,
            "location_lng": 79.8612,
            "location_address": "Colombo Fort",
            "location_city": "Colombo",
            "description": "Helmet report",
            "vehicle_plate": "",
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

    assert response.status_code == 200
    created_report = response.json()
    assert queued_jobs == [(created_report["id"], "evidence")]


def test_police_evidence_report_list_exposes_inference_log(client, police_token, db_session, citizen_user):
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id="EV-PIPE-001",
        violation_type="helmet",
        incident_at=datetime(2026, 4, 30, 10, 0, 0, tzinfo=timezone.utc),
        location_lat=6.9271,
        location_lng=79.8612,
        location_address="Colombo, Sri Lanka",
        location_city="Colombo",
        status=ReportStatusEnum.UNDER_REVIEW,
    )
    db_session.add(report)
    db_session.flush()
    db_session.add(
        models.InferenceLog(
            evidence_report_id=report.id,
            model_version="helmet_best.pt|anpr_best.pt|easyocr",
            bbox_coordinates={"inferred_violation_type": "no-helmet", "confidence_band": "high"},
            confidence=0.91,
            ocr_text="WP-1234",
            ocr_confidence=0.88,
            inference_latency=0.42,
        )
    )
    db_session.commit()

    response = client.get(
        "/api/evidence-reports",
        headers={"Authorization": f"Bearer {police_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    matched_report = next(item for item in payload if item["id"] == report.id)
    assert matched_report["inference_log"] is not None
    assert matched_report["inference_log"]["ocr_text"] == "WP-1234"

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
    assert matched_report["ai_summary"] is not None
    assert matched_report["ai_summary"]["provider"] is None
    assert matched_report["ai_summary"]["model_id"] == "helmet_best.pt"
    assert matched_report["ai_summary"]["claimed_violation_type"] == "helmet"
    assert matched_report["ai_summary"]["inferred_violation_type"] == "no-helmet"
    assert matched_report["ai_summary"]["confidence_level"] == "high"
    assert matched_report["ai_summary"]["manual_review_required"] is False


def test_police_evidence_report_detail_exposes_ai_summary(client, police_token, db_session, citizen_user):
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id="EV-PIPE-DETAIL-001",
        violation_type="helmet",
        incident_at=datetime(2026, 4, 30, 11, 0, 0, tzinfo=timezone.utc),
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
            model_version="helmet-detection-yolov8/1|anpr_best.pt|easyocr",
            bbox_coordinates={
                "claimed_violation_type": "helmet",
                "inferred_violation_type": "no-helmet",
                "has_helmet_violation": True,
                "violation_provider": "roboflow",
                "violation_confidence": 0.91,
                "violation_confidence_level": "high",
                "needs_manual_review": False,
                "violation_detected_classes": ["no_helmet"],
                "violation_detections": [
                    {
                        "class": "no_helmet",
                        "normalized_class": "no-helmet",
                        "confidence": 0.91,
                        "confidence_level": "high",
                        "bbox": {"x": 144, "y": 168, "width": 86, "height": 102},
                    }
                ],
            },
            confidence=0.91,
            ocr_text="WP-1234",
            ocr_confidence=0.88,
            inference_latency=0.42,
        )
    )
    db_session.commit()

    response = client.get(
        f"/api/evidence-reports/{report.id}",
        headers={"Authorization": f"Bearer {police_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ai_summary"] is not None
    assert payload["ai_summary"]["provider"] == "roboflow"
    assert payload["ai_summary"]["model_id"] == "helmet-detection-yolov8/1"
    assert payload["ai_summary"]["has_helmet_violation"] is True
    assert payload["ai_summary"]["confidence"] == 0.91
    assert payload["ai_summary"]["confidence_level"] == "high"
    assert payload["ai_summary"]["manual_review_required"] is False
    assert payload["ai_summary"]["detected_classes"] == ["no_helmet"]
    assert payload["ai_summary"]["detections"][0]["class"] == "no_helmet"


def test_police_can_rerun_evidence_report_inference(client, police_token, db_session, citizen_user, monkeypatch):
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id="EV-RERUN-001",
        violation_type="helmet",
        incident_at=datetime(2026, 5, 1, 9, 0, 0, tzinfo=timezone.utc),
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
            model_version="helmet-detection-yolov8/1|anpr_best.pt|easyocr",
            bbox_coordinates={
                "claimed_violation_type": "helmet",
                "violation_provider": "roboflow",
                "violation_detection_status": "configuration_error",
                "violation_error": "ROBOFLOW_API_KEY is not set.",
                "needs_manual_review": True,
            },
            confidence=0.0,
            ocr_text=None,
            ocr_confidence=0.0,
            inference_latency=0.42,
        )
    )
    db_session.commit()

    def fake_attempt_inference(target_report, db, report_kind="evidence", attempt=1):
        inference_log = db.query(models.InferenceLog).filter_by(evidence_report_id=target_report.id).one()
        inference_log.model_version = "helmet-detection-yolov8/1|anpr_best.pt|easyocr"
        inference_log.bbox_coordinates = {
            "claimed_violation_type": "helmet",
            "inferred_violation_type": "no-helmet",
            "has_helmet_violation": True,
            "violation_provider": "roboflow",
            "violation_confidence": 0.91,
            "violation_confidence_level": "high",
            "needs_manual_review": False,
            "violation_detected_classes": ["no_helmet"],
            "violation_detections": [
                {
                    "class": "no_helmet",
                    "normalized_class": "no-helmet",
                    "confidence": 0.91,
                    "confidence_level": "high",
                    "bbox": {"x": 144, "y": 168, "width": 86, "height": 102},
                }
            ],
        }
        inference_log.confidence = 0.91
        inference_log.ocr_text = "WP-1234"
        inference_log.ocr_confidence = 0.88
        inference_log.timestamp = datetime.utcnow()
        db.commit()

    monkeypatch.setattr("api.routers.evidence_reports.attempt_inference", fake_attempt_inference)

    response = client.post(
        f"/api/evidence-reports/{report.id}/rerun-inference",
        headers={"Authorization": f"Bearer {police_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ai_summary"] is not None
    assert payload["ai_summary"]["provider"] == "roboflow"
    assert payload["ai_summary"]["model_id"] == "helmet-detection-yolov8/1"
    assert payload["ai_summary"]["error"] is None
    assert payload["ai_summary"]["has_helmet_violation"] is True
    assert payload["ai_summary"]["confidence"] == 0.91

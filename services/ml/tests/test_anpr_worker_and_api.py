from __future__ import annotations

from datetime import datetime, timezone

from api import models
from api.constants import ReportStatusEnum
from api.worker import attempt_inference


def _create_report(db_session, citizen_user, violation_type: str) -> models.EvidenceReport:
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id=f"EV-ANPR-{violation_type}",
        violation_type=violation_type,
        incident_at=datetime(2026, 5, 1, 8, 30, 0, tzinfo=timezone.utc),
        location_lat=6.9271,
        location_lng=79.8612,
        location_address="Colombo Fort",
        location_city="Colombo",
        location_district="Colombo",
        vehicle_plate=None,
        status=ReportStatusEnum.SUBMITTED,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def _successful_violation_result(family: str, inferred: str) -> dict:
    return {
        "violation_family": family,
        "status": "success",
        "inferred_violation_type": inferred,
        "has_violation": True,
        "confidence": 0.82,
        "confidence_level": "high",
        "manual_review_required": False,
        "review_reason": None,
        "detected_classes": [family],
        "detections": [],
        "provider": "roboflow",
        "model_id": f"{family}/1",
        "error": None,
    }


def _successful_anpr_result(image_path: str | None) -> dict:
    return {
        "plate_detected": True,
        "plate_text": "WP AB 1234",
        "normalized_plate_text": "WPAB1234",
        "plate_confidence": 0.91,
        "ocr_confidence": 0.87,
        "plate_bbox": {"x1": 10, "y1": 20, "x2": 120, "y2": 52},
        "bbox": {"x1": 10, "y1": 20, "x2": 120, "y2": 52},
        "crop_path": "temp/anpr_crops/example.png",
        "status": "success",
        "validation_status": "valid_sri_lankan_format",
        "raw_text": "WP AB 1234",
        "ocr_candidates": [],
        "detections": [],
        "detected_classes": ["License_Plate"],
        "num_detections": 1,
        "detection_confidence": 0.91,
        "error": None,
    }


def test_worker_runs_anpr_for_helmet_red_light_and_white_line(db_session, citizen_user, monkeypatch):
    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr("api.worker.run_helmet_detection", lambda *_: _successful_violation_result("helmet", "NO_HELMET"))
    monkeypatch.setattr("api.worker.run_red_light_detection", lambda *_: _successful_violation_result("red_light", "RED_LIGHT"))
    monkeypatch.setattr("api.worker.run_white_line_detection", lambda *_: _successful_violation_result("white_line", "WHITE_LINE"))

    anpr_calls = []

    def fake_anpr(image_path):
        anpr_calls.append(image_path)
        return _successful_anpr_result(image_path)

    monkeypatch.setattr("api.worker.run_anpr_pipeline", fake_anpr)

    for violation_type in ("helmet", "red_light", "white_line"):
        report = _create_report(db_session, citizen_user, violation_type)
        attempt_inference(report, db_session, report_kind="evidence")
        db_session.refresh(report)
        inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
        assert report.vehicle_plate == "WPAB1234"
        assert inference_log.ocr_text == "WPAB1234"
        assert inference_log.plate_text == "WP AB 1234"
        assert inference_log.normalized_plate_text == "WPAB1234"
        assert inference_log.plate_confidence == 0.91
        assert inference_log.anpr_status == "success"
        assert inference_log.bbox_coordinates["plate_bbox"] == {"x1": 10, "y1": 20, "x2": 120, "y2": 52}
        assert inference_log.bbox_coordinates["anpr_status"] == "success"

    assert anpr_calls == ["/tmp/evidence.jpg", "/tmp/evidence.jpg", "/tmp/evidence.jpg"]


def test_anpr_failure_does_not_crash_inference_and_marks_manual_review(db_session, citizen_user, monkeypatch):
    report = _create_report(db_session, citizen_user, "helmet")
    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr("api.worker.run_helmet_detection", lambda *_: _successful_violation_result("helmet", "NO_HELMET"))
    monkeypatch.setattr(
        "api.worker.run_anpr_pipeline",
        lambda *_: {
            "plate_detected": False,
            "plate_text": None,
            "normalized_plate_text": None,
            "plate_confidence": 0.0,
            "ocr_confidence": 0.0,
            "plate_bbox": None,
            "bbox": None,
            "crop_path": None,
            "status": "model_missing",
            "validation_status": "model_missing",
            "raw_text": None,
            "ocr_candidates": [],
            "detections": [],
            "detected_classes": [],
            "num_detections": 0,
            "detection_confidence": 0.0,
            "error": None,
        },
    )

    attempt_inference(report, db_session, report_kind="evidence")
    db_session.refresh(report)
    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()

    assert report.status == ReportStatusEnum.UNDER_REVIEW
    assert report.manual_review_required is True
    assert inference_log.bbox_coordinates["anpr_status"] == "model_missing"
    assert inference_log.bbox_coordinates["needs_manual_review"] is True


def test_police_manual_plate_correction_persists(client, police_token, db_session, citizen_user):
    report = _create_report(db_session, citizen_user, "helmet")
    report.status = ReportStatusEnum.UNDER_REVIEW
    db_session.add(
        models.InferenceLog(
            evidence_report_id=report.id,
            model_version="helmet/1|anpr:success",
            bbox_coordinates={
                "plate_detected": True,
                "plate_text": "WP AB I23O",
                "normalized_plate_text": "WPAB1230",
                "plate_bbox": {"x1": 10, "y1": 20, "x2": 120, "y2": 52},
                "anpr_status": "success",
            },
            confidence=0.82,
            ocr_text="WPAB1230",
            ocr_confidence=0.76,
            inference_latency=0.5,
        )
    )
    db_session.commit()

    response = client.patch(
        f"/api/evidence-reports/{report.id}/plate",
        headers={"Authorization": f"Bearer {police_token}"},
        json={"corrected_plate_text": "WP AB 1234", "notes": "Verified from image"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["vehicle_plate"] == "WPAB1234"
    assert payload["ai_summary"]["plate_review"]["manual_correction"] == "WPAB1234"

    db_session.refresh(report)
    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert report.vehicle_plate == "WPAB1234"
    assert inference_log.ocr_text == "WPAB1234"
    assert inference_log.normalized_plate_text == "WPAB1234"
    assert inference_log.officer_corrected_plate_text == "WPAB1234"
    assert inference_log.plate_corrected_by is not None
    assert inference_log.plate_corrected_at is not None
    assert inference_log.bbox_coordinates["manual_plate_correction"]["corrected_plate_number"] == "WPAB1234"
    assert inference_log.bbox_coordinates["manual_plate_correction"]["corrected_plate_text"] == "WPAB1234"


def test_citizen_cannot_correct_plate_number(client, citizen_token, db_session, citizen_user):
    report = _create_report(db_session, citizen_user, "helmet")

    response = client.patch(
        f"/api/evidence-reports/{report.id}/plate",
        headers={"Authorization": f"Bearer {citizen_token}"},
        json={"corrected_plate_text": "WP AB 1234"},
    )

    assert response.status_code in {401, 403}


def test_admin_anpr_performance_counts_plate_metrics(client, admin_token, db_session, citizen_user):
    report = _create_report(db_session, citizen_user, "helmet")
    db_session.add(
        models.InferenceLog(
            evidence_report_id=report.id,
            model_version="helmet/1|anpr:success",
            bbox_coordinates={
                "plate_detected": True,
                "normalized_plate_text": "WPAB1234",
                "plate_detection_confidence": 0.9,
                "ocr_confidence": 0.8,
                "manual_plate_correction": {"corrected_plate_number": "WPAB1234"},
                "anpr_status": "success",
            },
            confidence=0.82,
            ocr_text="WPAB1234",
            ocr_confidence=0.8,
            inference_latency=0.5,
        )
    )
    db_session.commit()

    response = client.get(
        "/api/admin/analytics/anpr-performance",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_reports_with_plate_detected"] == 1
    assert payload["ocr_succeeded"] == 1
    assert payload["ocr_failed"] == 0
    assert payload["avg_plate_detection_confidence"] == 0.9
    assert payload["avg_ocr_confidence"] == 0.8
    assert payload["manual_plate_correction_count"] == 1
    assert payload["anpr_failure_count"] == 0

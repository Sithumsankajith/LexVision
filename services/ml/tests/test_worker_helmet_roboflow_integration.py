from datetime import datetime, timezone

from api import models
from api.constants import ReportStatusEnum
from api.worker import attempt_inference


def _create_evidence_report(db_session, citizen_user) -> models.EvidenceReport:
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id="EV-ROBOFLOW-001",
        violation_type="helmet",
        incident_at=datetime(2026, 5, 1, 8, 30, 0, tzinfo=timezone.utc),
        location_lat=6.9271,
        location_lng=79.8612,
        location_address="Colombo Fort",
        location_city="Colombo",
        vehicle_plate=None,
        status=ReportStatusEnum.SUBMITTED,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def _mock_anpr_result() -> dict:
    return {
        "plate_text": "WP-1234",
        "plate_confidence": 0.92,
        "bbox": {"x1": 10.0, "y1": 12.0, "x2": 120.0, "y2": 54.0},
        "crop_path": "temp/anpr_crops/mock.png",
        "validation_status": "valid_sri_lankan_format",
        "detections": [
            {
                "class": "License_Plate",
                "confidence": 0.95,
                "bbox": {"x1": 10.0, "y1": 12.0, "x2": 120.0, "y2": 54.0},
            }
        ],
        "detected_classes": ["License_Plate"],
        "num_detections": 1,
        "detection_confidence": 0.95,
        "raw_text": "WP1234",
        "ocr_candidates": [{"text": "WP1234", "confidence": 0.92}],
    }


def test_attempt_inference_records_high_confidence_no_helmet_result(db_session, citizen_user, monkeypatch):
    report = _create_evidence_report(db_session, citizen_user)

    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/mock-evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr("api.worker._build_anpr_result", lambda *_: _mock_anpr_result())
    monkeypatch.setattr(
        "api.worker.run_helmet_detection",
        lambda *_: {
            "detections": [
                {
                    "class": "no_helmet",
                    "confidence": 0.91,
                    "confidence_level": "high",
                    "bbox": {"x": 144.0, "y": 168.0, "width": 86.0, "height": 102.0},
                }
            ],
            "detected_classes": ["no_helmet"],
            "has_helmet_violation": True,
            "confidence": 0.91,
            "confidence_level": "high",
            "status": "success",
            "provider": "roboflow",
            "model_id": "helmet-detection-yolov8/1",
            "error": None,
        },
    )

    attempt_inference(report, db_session, report_kind="evidence")
    db_session.refresh(report)

    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert report.status == ReportStatusEnum.UNDER_REVIEW
    assert report.violation_type == "helmet"
    assert report.vehicle_plate == "WP-1234"
    assert inference_log.bbox_coordinates["claimed_violation_type"] == "helmet"
    assert inference_log.bbox_coordinates["inferred_violation_type"] == "no-helmet"
    assert inference_log.bbox_coordinates["violation_detection_status"] == "success"
    assert inference_log.bbox_coordinates["violation_confidence"] == 0.91
    assert inference_log.bbox_coordinates["violation_confidence_level"] == "high"
    assert inference_log.bbox_coordinates["needs_manual_review"] is False


def test_attempt_inference_flags_low_confidence_no_helmet_for_manual_review(db_session, citizen_user, monkeypatch):
    report = _create_evidence_report(db_session, citizen_user)

    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/mock-evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr("api.worker._build_anpr_result", lambda *_: _mock_anpr_result())
    monkeypatch.setattr(
        "api.worker.run_helmet_detection",
        lambda *_: {
            "detections": [
                {
                    "class": "no_helmet",
                    "confidence": 0.42,
                    "confidence_level": "low",
                    "bbox": {"x": 144.0, "y": 168.0, "width": 86.0, "height": 102.0},
                }
            ],
            "detected_classes": ["no_helmet"],
            "has_helmet_violation": True,
            "confidence": 0.42,
            "confidence_level": "low",
            "status": "success",
            "provider": "roboflow",
            "model_id": "helmet-detection-yolov8/1",
            "error": None,
        },
    )

    attempt_inference(report, db_session, report_kind="evidence")

    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert inference_log.bbox_coordinates["claimed_violation_type"] == "helmet"
    assert inference_log.bbox_coordinates["inferred_violation_type"] is None
    assert inference_log.bbox_coordinates["violation_detection_status"] == "low_confidence_violation"
    assert inference_log.bbox_coordinates["needs_manual_review"] is True
    assert "confidence threshold" in inference_log.bbox_coordinates["filtering"].lower()

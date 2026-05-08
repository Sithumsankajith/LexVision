from datetime import datetime, timezone

import pytest

from api import models
from api.constants import ReportStatusEnum
from api.worker import attempt_inference


def _create_evidence_report(db_session, citizen_user, violation_type: str) -> models.EvidenceReport:
    report = models.EvidenceReport(
        citizen_id=citizen_user.id,
        tracking_id=f"EV-{violation_type}-001",
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


@pytest.mark.parametrize(
    ("violation_type", "expected_runner", "expected_inferred", "expected_family"),
    [
        ("helmet", "helmet", "NO_HELMET", "helmet"),
        ("red_light", "red_light", "RED_LIGHT", "red_light"),
        ("white_line", "white_line", "WHITE_LINE", "white_line"),
    ],
)
def test_attempt_inference_routes_only_selected_violation_model_and_runs_anpr(
    db_session,
    citizen_user,
    monkeypatch,
    violation_type,
    expected_runner,
    expected_inferred,
    expected_family,
):
    report = _create_evidence_report(db_session, citizen_user, violation_type)
    called_runners: list[str] = []
    anpr_calls: list[str | None] = []

    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/mock-evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)

    def fake_helmet_runner(image_path: str):
        called_runners.append("helmet")
        return {
            "violation_family": "helmet",
            "status": "success",
            "inferred_violation_type": "NO_HELMET",
            "has_violation": True,
            "confidence": 0.91,
            "confidence_level": "high",
            "manual_review_required": False,
            "review_reason": None,
            "detected_classes": ["no_helmet"],
            "detections": [],
            "provider": "roboflow",
            "model_id": "helmet-no-helmet-detection/1",
            "error": None,
        }

    def fake_red_light_runner(image_path: str):
        called_runners.append("red_light")
        return {
            "violation_family": "red_light",
            "status": "success",
            "inferred_violation_type": "RED_LIGHT",
            "has_violation": True,
            "confidence": 0.78,
            "confidence_level": "medium",
            "manual_review_required": False,
            "review_reason": None,
            "detected_classes": ["red_light"],
            "detections": [],
            "provider": "roboflow",
            "model_id": "red-light-violation-detect-dataset-a9rsa/1",
            "error": None,
        }

    def fake_white_line_runner(image_path: str):
        called_runners.append("white_line")
        return {
            "violation_family": "white_line",
            "status": "success",
            "inferred_violation_type": "WHITE_LINE",
            "has_violation": True,
            "confidence": 0.66,
            "confidence_level": "medium",
            "manual_review_required": False,
            "review_reason": None,
            "detected_classes": ["white_line_crossing"],
            "detections": [],
            "provider": "roboflow",
            "model_id": "lane-detection-yolov8/2",
            "error": None,
        }

    def fake_anpr_pipeline(image_path: str | None):
        anpr_calls.append(image_path)
        return {
            "plate_text": None,
            "status": "pending",
        }

    monkeypatch.setattr("api.worker.run_helmet_detection", fake_helmet_runner)
    monkeypatch.setattr("api.worker.run_red_light_detection", fake_red_light_runner)
    monkeypatch.setattr("api.worker.run_white_line_detection", fake_white_line_runner)
    monkeypatch.setattr("api.worker.run_anpr_pipeline", fake_anpr_pipeline)

    attempt_inference(report, db_session, report_kind="evidence")
    db_session.refresh(report)

    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert called_runners == [expected_runner]
    assert anpr_calls == ["/tmp/mock-evidence.jpg"]
    assert report.status == ReportStatusEnum.UNDER_REVIEW
    assert inference_log.bbox_coordinates["claimed_violation_type"] == violation_type
    assert inference_log.bbox_coordinates["violation_family"] == expected_family
    assert inference_log.bbox_coordinates["inferred_violation_type"] == expected_inferred
    assert inference_log.bbox_coordinates["has_violation"] is True
    assert inference_log.bbox_coordinates["needs_manual_review"] is False
    assert inference_log.bbox_coordinates["anpr_status"] == "pending"


def test_attempt_inference_marks_manual_review_for_low_confidence_selected_model(db_session, citizen_user, monkeypatch):
    report = _create_evidence_report(db_session, citizen_user, "helmet")
    anpr_calls: list[str | None] = []

    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/mock-evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr(
        "api.worker.run_helmet_detection",
        lambda *_: {
            "violation_family": "helmet",
            "status": "no_detection",
            "inferred_violation_type": None,
            "has_violation": False,
            "confidence": 0.42,
            "confidence_level": "low",
            "manual_review_required": True,
            "review_reason": "AI could not confirm a helmet violation confidently.",
            "detected_classes": ["no_helmet"],
            "detections": [],
            "provider": "roboflow",
            "model_id": "helmet-no-helmet-detection/1",
            "error": None,
        },
    )
    monkeypatch.setattr("api.worker.run_red_light_detection", lambda *_: pytest.fail("red-light model should not run"))
    monkeypatch.setattr("api.worker.run_white_line_detection", lambda *_: pytest.fail("white-line model should not run"))
    monkeypatch.setattr(
        "api.worker.run_anpr_pipeline",
        lambda image_path: anpr_calls.append(image_path) or {"plate_text": None, "status": "pending"},
    )

    attempt_inference(report, db_session, report_kind="evidence")

    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert anpr_calls == ["/tmp/mock-evidence.jpg"]
    assert inference_log.bbox_coordinates["has_violation"] is False
    assert inference_log.bbox_coordinates["needs_manual_review"] is True
    assert inference_log.bbox_coordinates["violation_review_reason"] == "AI could not confirm a helmet violation confidently."


def test_attempt_inference_skips_specialized_models_for_other_and_runs_anpr(db_session, citizen_user, monkeypatch):
    report = _create_evidence_report(db_session, citizen_user, "other")
    report.custom_violation_description = "A vehicle blocked the pedestrian crossing."
    db_session.commit()

    anpr_calls: list[str | None] = []

    monkeypatch.setattr("api.worker._select_primary_evidence_image", lambda *_: "/tmp/mock-evidence.jpg")
    monkeypatch.setattr("api.worker._cleanup_temporary_evidence", lambda *_: None)
    monkeypatch.setattr("api.worker.run_helmet_detection", lambda *_: pytest.fail("helmet model should not run"))
    monkeypatch.setattr("api.worker.run_red_light_detection", lambda *_: pytest.fail("red-light model should not run"))
    monkeypatch.setattr("api.worker.run_white_line_detection", lambda *_: pytest.fail("white-line model should not run"))
    monkeypatch.setattr(
        "api.worker.run_anpr_pipeline",
        lambda image_path: anpr_calls.append(image_path) or {
            "plate_text": "WP-1234",
            "plate_confidence": 0.82,
            "status": "success",
            "raw_text": "WP-1234",
            "ocr_candidates": [{"text": "WP-1234", "confidence": 0.82}],
            "validation_status": "valid",
            "num_detections": 1,
        },
    )

    attempt_inference(report, db_session, report_kind="evidence")
    db_session.refresh(report)

    inference_log = db_session.query(models.InferenceLog).filter_by(evidence_report_id=report.id).one()
    assert anpr_calls == ["/tmp/mock-evidence.jpg"]
    assert report.status == ReportStatusEnum.UNDER_REVIEW
    assert report.manual_review_required is True
    assert report.vehicle_plate == "WP-1234"
    assert inference_log.bbox_coordinates["claimed_violation_type"] == "other"
    assert inference_log.bbox_coordinates["violation_family"] == "other"
    assert inference_log.bbox_coordinates["violation_detection_status"] == "manual_review_required"
    assert inference_log.bbox_coordinates["needs_manual_review"] is True
    assert inference_log.bbox_coordinates["custom_violation_description"] == "A vehicle blocked the pedestrian crossing."
    assert inference_log.bbox_coordinates["anpr_status"] == "success"

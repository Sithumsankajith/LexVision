from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from . import schemas
from .services.evidence_storage import sign_evidence_url


def _schema_from_orm(schema_cls, obj):
    if hasattr(schema_cls, "model_validate"):
        return schema_cls.model_validate(obj)
    if isinstance(obj, dict):
        return schema_cls.parse_obj(obj)
    return schema_cls.from_orm(obj)


def _get_report_claimed_violation(report: Any) -> str | None:
    return getattr(report, "claimed_violation_type", None) or getattr(report, "violation_type", None)


def _get_violation_model_identifier(inference_log: Any, bbox_payload: dict[str, Any]) -> str | None:
    model_version = bbox_payload.get("model_version") or {}
    if isinstance(model_version, dict):
        if model_version.get("violation"):
            return model_version["violation"]
        if model_version.get("helmet"):
            return model_version["helmet"]

    combined_version = getattr(inference_log, "model_version", None)
    if isinstance(combined_version, str) and combined_version:
        return combined_version.split("|", 1)[0]
    return combined_version


def _get_report_final_violation(report: Any) -> str | None:
    final_violation = getattr(report, "final_violation_type", None)
    if final_violation:
        return final_violation

    status_value = getattr(getattr(report, "status", None), "value", getattr(report, "status", None))
    if status_value in {"VALIDATED", "CLOSED"}:
        return getattr(report, "violation_type", None)
    return None


def build_ai_summary(report: Any) -> schemas.AISummaryResponse | None:
    inference_log = getattr(report, "inference_log", None)
    if inference_log is None:
        return None

    bbox_payload = inference_log.bbox_coordinates or {}
    anpr_output = bbox_payload.get("anpr_output") or {}
    manual_correction = bbox_payload.get("manual_plate_correction") or {}
    plate_confidence = float(
        bbox_payload.get("plate_detection_confidence")
        or bbox_payload.get("plate_confidence")
        or anpr_output.get("plate_confidence")
        or getattr(inference_log, "plate_confidence", None)
        or 0.0
    )
    ocr_confidence = float(
        bbox_payload.get("ocr_confidence")
        or anpr_output.get("ocr_confidence")
        or getattr(inference_log, "ocr_confidence", None)
        or 0.0
    )
    if plate_confidence >= 0.8 and ocr_confidence >= 0.8:
        plate_confidence_level = "high"
    elif plate_confidence >= 0.5 and ocr_confidence >= 0.5:
        plate_confidence_level = "medium"
    else:
        plate_confidence_level = "low"

    payload = {
        "violation_family": bbox_payload.get("violation_family"),
        "provider": bbox_payload.get("violation_provider"),
        "model_id": bbox_payload.get("violation_model_id") or _get_violation_model_identifier(inference_log, bbox_payload),
        "claimed_violation_type": bbox_payload.get("claimed_violation_type") or _get_report_claimed_violation(report),
        "inferred_violation_type": bbox_payload.get("inferred_violation_type") or getattr(report, "inferred_violation_type", None),
        "final_violation_type": _get_report_final_violation(report),
        "has_violation": bool(bbox_payload.get("has_violation", bbox_payload.get("has_helmet_violation"))),
        "has_helmet_violation": bool(bbox_payload.get("has_helmet_violation")),
        "confidence": float(bbox_payload.get("violation_confidence") or 0.0),
        "confidence_level": bbox_payload.get("violation_confidence_level") or bbox_payload.get("confidence_band"),
        "manual_review_required": bool(
            bbox_payload.get(
                "manual_review_required",
                bbox_payload.get("needs_manual_review", False),
            )
        ),
        "review_reason": bbox_payload.get("violation_review_reason"),
        "detected_classes": bbox_payload.get("violation_detected_classes") or [],
        "detections": bbox_payload.get("violation_detections") or [],
        "error": bbox_payload.get("violation_error"),
        "status": bbox_payload.get("violation_detection_status"),
        "processed_at": bbox_payload.get("processing_timestamp"),
        "plate_review": {
            "plate_detected": bool(
                bbox_payload.get("plate_detected")
                or anpr_output.get("plate_detected")
                or getattr(inference_log, "plate_bbox", None)
            ),
            "plate_text": bbox_payload.get("plate_text")
            or anpr_output.get("plate_text")
            or getattr(inference_log, "plate_text", None),
            "normalized_plate_text": bbox_payload.get("normalized_plate_text")
            or anpr_output.get("normalized_plate_text")
            or getattr(inference_log, "normalized_plate_text", None)
            or getattr(inference_log, "ocr_text", None),
            "confidence_level": plate_confidence_level,
            "plate_confidence": plate_confidence,
            "ocr_confidence": ocr_confidence,
            "plate_bbox": bbox_payload.get("plate_bbox")
            or anpr_output.get("plate_bbox")
            or anpr_output.get("bbox")
            or getattr(inference_log, "plate_bbox", None),
            "crop_path": bbox_payload.get("crop_path") or anpr_output.get("crop_path") or getattr(inference_log, "plate_crop_path", None),
            "status": bbox_payload.get("anpr_status") or anpr_output.get("status") or getattr(inference_log, "anpr_status", None),
            "validation_status": bbox_payload.get("validation_status") or anpr_output.get("validation_status"),
            "error": bbox_payload.get("anpr_error") or anpr_output.get("error") or getattr(inference_log, "anpr_error", None),
            "manual_correction": manual_correction.get("corrected_plate_number")
            or getattr(inference_log, "officer_corrected_plate_text", None),
            "manual_correction_at": manual_correction.get("corrected_at") or getattr(inference_log, "plate_corrected_at", None),
        },
    }
    return _schema_from_orm(schemas.AISummaryResponse, payload)


def _attach_signed_evidence_urls(response: Any) -> Any:
    files = getattr(response, "files", None)
    if not files:
        return response

    for evidence_file in files:
        storage_url = getattr(evidence_file, "storage_url", None)
        if isinstance(storage_url, str) and storage_url.startswith("data:"):
            continue
        file_id = getattr(evidence_file, "id", None)
        if file_id:
            evidence_file.storage_url = sign_evidence_url(file_id)
    return response


def present_report(report: Any) -> schemas.ReportResponse:
    response = _schema_from_orm(schemas.ReportResponse, report)
    response.ai_summary = build_ai_summary(report)
    return response


def present_reports(reports: Iterable[Any]) -> list[schemas.ReportResponse]:
    return [present_report(report) for report in reports]


def present_evidence_report(report: Any):
    response = _schema_from_orm(schemas.StaffEvidenceReportResponse, report)
    response.ai_summary = build_ai_summary(report)
    return _attach_signed_evidence_urls(response)


def present_evidence_reports(reports: Iterable[Any]):
    return [present_evidence_report(report) for report in reports]


def present_citizen_evidence_report(report: Any):
    response = _schema_from_orm(schemas.CitizenEvidenceReportResponse, report)
    response.ai_summary = build_ai_summary(report)
    return _attach_signed_evidence_urls(response)


def present_citizen_report_detail(report: Any):
    response = _schema_from_orm(schemas.CitizenReportDetailResponse, report)
    response.ai_summary = build_ai_summary(report)
    return _attach_signed_evidence_urls(response)

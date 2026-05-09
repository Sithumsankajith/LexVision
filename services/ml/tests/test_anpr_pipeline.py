from __future__ import annotations

import sys
import types
from pathlib import Path

import cv2
import numpy as np

from dataset_tools.audit_anpr_dataset import audit_dataset
from inference import anpr_pipeline
from inference.plate_format import normalize_plate_text, normalize_sri_lankan_plate


def test_sri_lankan_plate_normalization_supported_formats():
    assert normalize_sri_lankan_plate("abc 1234").normalized_text == "ABC1234"
    assert normalize_sri_lankan_plate("AB-1234").normalized_text == "AB1234"
    assert normalize_sri_lankan_plate("WP ABC 1234").normalized_text == "WPABC1234"
    assert normalize_sri_lankan_plate("WP AB 1234").normalized_text == "WPAB1234"
    assert normalize_sri_lankan_plate("12-3456").normalized_text == "12-3456"
    assert normalize_sri_lankan_plate("WPAB I23O").normalized_text == "WPAB1230"
    normalized = normalize_plate_text("WP AB-I23O")
    assert normalized["normalized"] == "WPAB1230"
    assert normalized["is_valid"] is True
    assert normalized["format_type"] == "province_two_letter_series"


def test_anpr_model_loader_uses_configured_model_path(tmp_path, monkeypatch):
    model_path = tmp_path / "anpr_best.pt"
    model_path.write_bytes(b"fake model")
    loaded_paths = []

    class FakeYOLO:
        def __init__(self, path):
            loaded_paths.append(path)

    monkeypatch.setenv("ANPR_MODEL_PATH", str(model_path))
    monkeypatch.setitem(sys.modules, "ultralytics", types.SimpleNamespace(YOLO=FakeYOLO))
    monkeypatch.setattr(anpr_pipeline, "_plate_detector", None)
    monkeypatch.setattr(anpr_pipeline, "_plate_detector_load_attempted", False)

    detector = anpr_pipeline._get_plate_detector()

    assert isinstance(detector, FakeYOLO)
    assert loaded_paths == [str(model_path)]


def test_anpr_model_missing_does_not_run_full_image_ocr(tmp_path, monkeypatch):
    image_path = tmp_path / "evidence.jpg"
    cv2.imwrite(str(image_path), np.zeros((80, 160, 3), dtype=np.uint8))

    monkeypatch.setattr(anpr_pipeline, "_get_plate_detector", lambda: None)

    def fail_ocr():
        raise AssertionError("OCR must not run when the detector model is missing")

    monkeypatch.setattr(anpr_pipeline, "_get_ocr_pipeline", fail_ocr)

    result = anpr_pipeline.run_anpr_pipeline(str(image_path))

    assert result["status"] == "model_missing"
    assert result["plate_detected"] is False
    assert result["normalized_plate_text"] is None


def test_anpr_no_plate_does_not_run_full_image_ocr(tmp_path, monkeypatch):
    image_path = tmp_path / "evidence.jpg"
    cv2.imwrite(str(image_path), np.zeros((80, 160, 3), dtype=np.uint8))

    class FakeDetector:
        def predict(self, **_kwargs):
            return [type("Result", (), {"boxes": [], "names": {0: "License_Plate"}})()]

    monkeypatch.setattr(anpr_pipeline, "_get_plate_detector", lambda: FakeDetector())

    def fail_ocr():
        raise AssertionError("OCR must not run when no plate bbox is detected")

    monkeypatch.setattr(anpr_pipeline, "_get_ocr_pipeline", fail_ocr)

    result = anpr_pipeline.run_anpr_pipeline(str(image_path))

    assert result["status"] == "no_plate"
    assert result["plate_detected"] is False
    assert result["plate_bbox"] is None


def test_anpr_plate_detection_runs_ocr_only_on_crop(tmp_path, monkeypatch):
    image_path = tmp_path / "evidence.jpg"
    cv2.imwrite(str(image_path), np.full((100, 200, 3), 255, dtype=np.uint8))
    ocr_inputs = []

    class FakeBox:
        cls = np.array([0])
        conf = np.array([0.93])
        xyxy = np.array([[20, 30, 140, 60]], dtype=float)

    class FakeDetector:
        def predict(self, **_kwargs):
            return [type("Result", (), {"boxes": [FakeBox()], "names": {0: "License_Plate"}})()]

    class FakeOCR:
        def extract_text(self, image):
            ocr_inputs.append(image)
            assert not isinstance(image, str)
            assert image.shape[0] > 0 and image.shape[1] > 0
            return {"text": "WP AB 1234", "confidence": 0.88, "status": "success"}

    monkeypatch.setattr(anpr_pipeline, "_get_plate_detector", lambda: FakeDetector())
    monkeypatch.setattr(anpr_pipeline, "_get_ocr_pipeline", lambda: FakeOCR())
    monkeypatch.setattr(anpr_pipeline, "TEMP_DIR", tmp_path / "crops")

    result = anpr_pipeline.run_anpr_pipeline(str(image_path))

    assert len(ocr_inputs) == 1
    assert result["status"] == "success"
    assert result["plate_detected"] is True
    assert result["plate_bbox"] == {
        "x": 80.0,
        "y": 45.0,
        "width": 120.0,
        "height": 30.0,
        "x1": 20.0,
        "y1": 30.0,
        "x2": 140.0,
        "y2": 60.0,
    }
    assert result["normalized_plate_text"] == "WPAB1234"
    assert result["plate_confidence"] == 0.93
    assert result["ocr_confidence"] == 0.88


def test_anpr_ocr_failure_keeps_detected_bbox(tmp_path, monkeypatch):
    image_path = tmp_path / "evidence.jpg"
    cv2.imwrite(str(image_path), np.full((100, 200, 3), 255, dtype=np.uint8))

    class FakeBox:
        cls = np.array([0])
        conf = np.array([0.91])
        xyxy = np.array([[30, 35, 150, 70]], dtype=float)

    class FakeDetector:
        def predict(self, **_kwargs):
            return [type("Result", (), {"boxes": [FakeBox()], "names": {0: "License_Plate"}})()]

    class FakeOCR:
        def extract_candidates(self, image, min_confidence=0.2):
            assert not isinstance(image, str)
            return []

        def extract_text(self, image):
            assert not isinstance(image, str)
            return {"text": None, "confidence": 0.0, "status": "no_valid_text_detected"}

    monkeypatch.setattr(anpr_pipeline, "_get_plate_detector", lambda: FakeDetector())
    monkeypatch.setattr(anpr_pipeline, "_get_ocr_pipeline", lambda: FakeOCR())
    monkeypatch.setattr(anpr_pipeline, "TEMP_DIR", tmp_path / "crops")

    result = anpr_pipeline.run_anpr_pipeline(str(image_path))

    assert result["status"] == "ocr_failed"
    assert result["plate_detected"] is True
    assert result["plate_bbox"]["x1"] == 30.0
    assert result["crop_path"] is not None
    assert result["normalized_plate_text"] is None


def test_anpr_dataset_audit_detects_invalid_bbox_and_missing_label(tmp_path):
    dataset = tmp_path / "dataset"
    for split_dir in ("train", "valid", "test"):
        (dataset / split_dir / "images").mkdir(parents=True)
        (dataset / split_dir / "labels").mkdir(parents=True)

    (dataset / "data.yaml").write_text(
        "train: ../train/images\nval: ../valid/images\ntest: ../test/images\nnc: 1\nnames: ['License_Plate']\n",
        encoding="utf-8",
    )
    cv2.imwrite(str(dataset / "train" / "images" / "valid.jpg"), np.zeros((20, 20, 3), dtype=np.uint8))
    cv2.imwrite(str(dataset / "train" / "images" / "missing-label.jpg"), np.zeros((20, 20, 3), dtype=np.uint8))
    (dataset / "train" / "labels" / "valid.txt").write_text("0 1.2 0.5 0.2 0.2\n", encoding="utf-8")

    summary = audit_dataset(dataset)

    assert summary["splits"]["train"]["image_count"] == 2
    assert summary["issues"]["missing_labels"] == 1
    assert summary["issues"]["invalid_bounding_boxes"] == 1
    assert summary["single_class_plate_detection"] is True

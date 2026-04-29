from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parents[1]
TRAINING_DIR = BASE_DIR / "training"
RESULTS_DIR = Path(__file__).resolve().parent / "results"

if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from common import (  # type: ignore[attr-defined]
    detect_split_path,
    ensure_directory,
    inspect_dataset,
    path_exists,
    resolve_weights_path,
    safe_float,
    to_relative,
    utc_timestamp,
    write_json,
    write_text,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
IMAGE_COLUMN_CANDIDATES = ("image", "image_name", "filename", "file_name", "file", "path", "image_path")
PLATE_COLUMN_CANDIDATES = ("plate", "plate_text", "ground_truth", "ground_truth_plate", "gt_plate", "gt", "text")

LETTER_TO_DIGIT_MAP = str.maketrans(
    {
        "O": "0",
        "Q": "0",
        "D": "0",
        "I": "1",
        "L": "1",
        "Z": "2",
        "S": "5",
        "B": "8",
        "G": "6",
    }
)
DIGIT_TO_LETTER_MAP = str.maketrans(
    {
        "0": "O",
        "1": "I",
        "2": "Z",
        "5": "S",
        "6": "G",
        "8": "B",
    }
)
SRI_LANKAN_PLATE_REGEX = re.compile(r"^(?P<prefix>[A-Z]{2,5})(?P<number>\d{4})$")

_ocr_reader = None
_ocr_reader_load_attempted = False


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate an ANPR detector + OCR pipeline on a dataset split using plate-string ground truth from CSV."
    )
    parser.add_argument("--model", type=str, required=True, help="Path to the YOLOv8 ANPR weights file.")
    parser.add_argument("--data", type=str, required=True, help="Path to the dataset data.yaml file.")
    parser.add_argument(
        "--ground-truth-csv",
        type=str,
        required=True,
        help="CSV file with image identifiers and ground-truth plate strings.",
    )
    parser.add_argument("--split", type=str, default="test", help="Dataset split to evaluate. Defaults to test.")
    parser.add_argument("--imgsz", type=int, default=640, help="Evaluation image size.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold for detection.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold for detection metrics.")
    return parser


def _sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "run"


def _default_output_dir(model_path: Path, data_path: Path, split_name: str) -> Path:
    run_name = _sanitize_name(f"anpr_e2e_{model_path.stem}_{data_path.parent.name}_{split_name}")
    return ensure_directory(RESULTS_DIR / run_name)


def _resolve_csv_columns(fieldnames: list[str] | None) -> tuple[str, str]:
    if not fieldnames:
        raise ValueError("Ground-truth CSV must contain a header row.")

    normalized = {name.lower(): name for name in fieldnames}
    image_column = next((normalized[name] for name in IMAGE_COLUMN_CANDIDATES if name in normalized), None)
    plate_column = next((normalized[name] for name in PLATE_COLUMN_CANDIDATES if name in normalized), None)

    if image_column is None or plate_column is None:
        raise ValueError(
            "Ground-truth CSV must include image and plate columns. "
            f"Supported image columns: {', '.join(IMAGE_COLUMN_CANDIDATES)}. "
            f"Supported plate columns: {', '.join(PLATE_COLUMN_CANDIDATES)}."
        )

    return image_column, plate_column


def _lookup_keys_for_identifier(value: str) -> set[str]:
    raw = value.strip().replace("\\", "/")
    if not raw:
        return set()

    path = Path(raw)
    keys = {
        raw.lower(),
        path.name.lower(),
        path.stem.lower(),
    }
    return {item for item in keys if item}


def _load_ground_truth_mapping(csv_path: Path) -> dict[str, dict[str, str]]:
    mapping: dict[str, dict[str, str]] = {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        image_column, plate_column = _resolve_csv_columns(reader.fieldnames)

        for row_number, row in enumerate(reader, start=2):
            image_value = (row.get(image_column) or "").strip()
            plate_value = (row.get(plate_column) or "").strip()
            if not image_value:
                continue

            entry = {"image": image_value, "ground_truth_text": plate_value}
            for key in _lookup_keys_for_identifier(image_value):
                existing = mapping.get(key)
                if existing and existing["ground_truth_text"] != plate_value:
                    raise ValueError(
                        f"Conflicting ground-truth entries for key '{key}' in {csv_path} at row {row_number}."
                    )
                mapping[key] = entry

    if not mapping:
        raise ValueError(f"No usable rows were found in ground-truth CSV: {csv_path}")
    return mapping


def _find_ground_truth_for_image(image_path: Path, split_path: Path, mapping: dict[str, dict[str, str]]) -> dict[str, str] | None:
    relative_value = image_path.relative_to(split_path).as_posix()
    for key in _lookup_keys_for_identifier(relative_value) | _lookup_keys_for_identifier(image_path.name):
        if key in mapping:
            return mapping[key]
    return None


def _get_ocr_reader():
    global _ocr_reader, _ocr_reader_load_attempted
    if _ocr_reader is not None:
        return _ocr_reader
    if _ocr_reader_load_attempted:
        return None

    _ocr_reader_load_attempted = True
    try:
        import easyocr
    except ImportError as exc:
        raise ImportError(
            "EasyOCR is required for end-to-end ANPR evaluation. Install the dependencies from services/ml/requirements.txt."
        ) from exc

    _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _ocr_reader


def _normalize_ground_truth_text(raw_text: str | None) -> tuple[str | None, str | None]:
    if not raw_text:
        return None, None

    compact = re.sub(r"[^A-Z0-9]", "", raw_text.upper())
    if not compact:
        return None, None
    return compact, raw_text.strip().upper()


def _normalize_predicted_plate(raw_text: str | None) -> tuple[str | None, str | None, str]:
    if not raw_text:
        return None, None, "no_text_detected"

    compact = re.sub(r"[^A-Z0-9]", "", raw_text.upper())
    if not compact:
        return None, None, "no_text_detected"

    if len(compact) < 6:
        return compact, compact, "invalid_sri_lankan_format"

    prefix = compact[:-4].translate(DIGIT_TO_LETTER_MAP)
    suffix = compact[-4:].translate(LETTER_TO_DIGIT_MAP)
    canonical = f"{prefix}{suffix}"

    match = SRI_LANKAN_PLATE_REGEX.match(canonical)
    if not match:
        return canonical, canonical, "invalid_sri_lankan_format"

    formatted = f"{match.group('prefix')}-{match.group('number')}"
    status = "valid_sri_lankan_format" if canonical == compact else "normalized_sri_lankan_format"
    return canonical, formatted, status


def _preprocess_plate_crop(crop: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop

    target_width = max(320, gray.shape[1] * 2)
    scale = target_width / max(gray.shape[1], 1)
    resized = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    denoised = cv2.fastNlMeansDenoising(resized, None, 15, 7, 21)
    thresholded = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(thresholded, -1, sharpen_kernel)


def _crop_highest_confidence_plate(image_path: Path, detection: dict[str, Any]) -> tuple[np.ndarray | None, dict[str, float] | None]:
    image = cv2.imread(str(image_path))
    if image is None:
        return None, None

    bbox = detection["bbox"]
    height, width = image.shape[:2]
    x1 = max(0, int(bbox["x1"]) - 4)
    y1 = max(0, int(bbox["y1"]) - 4)
    x2 = min(width, int(bbox["x2"]) + 4)
    y2 = min(height, int(bbox["y2"]) + 4)
    if x2 <= x1 or y2 <= y1:
        return None, None

    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return None, None

    return crop, {"x1": float(x1), "y1": float(y1), "x2": float(x2), "y2": float(y2)}


def _extract_best_detection(result: Any) -> dict[str, Any] | None:
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return None

    best_detection = None
    for box in boxes:
        conf = float(box.conf[0])
        xyxy = box.xyxy[0].tolist()
        candidate = {
            "confidence": round(conf, 4),
            "bbox": {
                "x1": round(xyxy[0], 1),
                "y1": round(xyxy[1], 1),
                "x2": round(xyxy[2], 1),
                "y2": round(xyxy[3], 1),
            },
        }
        if best_detection is None or candidate["confidence"] > best_detection["confidence"]:
            best_detection = candidate
    return best_detection


def _run_ocr_on_crop(crop: np.ndarray) -> dict[str, Any]:
    reader = _get_ocr_reader()
    processed = _preprocess_plate_crop(crop)
    results = reader.readtext(processed, detail=1, paragraph=False)

    candidates = []
    for _, text, confidence in results:
        canonical_text, formatted_text, validation_status = _normalize_predicted_plate(text)
        candidates.append(
            {
                "raw_text": text.strip().upper(),
                "canonical_text": canonical_text,
                "formatted_text": formatted_text,
                "confidence": round(float(confidence), 4),
                "validation_status": validation_status,
            }
        )

    if not candidates:
        return {
            "raw_text": None,
            "canonical_text": None,
            "formatted_text": None,
            "confidence": 0.0,
            "validation_status": "no_text_detected",
            "candidates": [],
        }

    def _rank(candidate: dict[str, Any]) -> tuple[int, float]:
        is_valid = candidate["validation_status"] in {"valid_sri_lankan_format", "normalized_sri_lankan_format"}
        return (1 if is_valid else 0, candidate["confidence"])

    best_candidate = max(candidates, key=_rank)
    return {
        "raw_text": best_candidate["raw_text"],
        "canonical_text": best_candidate["canonical_text"],
        "formatted_text": best_candidate["formatted_text"],
        "confidence": best_candidate["confidence"],
        "validation_status": best_candidate["validation_status"],
        "candidates": candidates,
    }


def _levenshtein_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)

    prev_row = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current_row = [i]
        for j, right_char in enumerate(right, start=1):
            insert_cost = current_row[j - 1] + 1
            delete_cost = prev_row[j] + 1
            replace_cost = prev_row[j - 1] + (0 if left_char == right_char else 1)
            current_row.append(min(insert_cost, delete_cost, replace_cost))
        prev_row = current_row
    return prev_row[-1]


def _collect_detection_metrics(
    *,
    model: YOLO,
    data_path: Path,
    split_name: str,
    imgsz: int,
    conf: float,
    iou: float,
    output_dir: Path,
) -> dict[str, Any]:
    metrics = model.val(
        data=str(data_path),
        split=split_name,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        plots=True,
        project=str(output_dir),
        name=f"detection_{split_name}",
        exist_ok=True,
        verbose=False,
    )

    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)
    save_dir = Path(getattr(metrics, "save_dir", output_dir / f"detection_{split_name}"))

    artifacts = []
    for filename in ("confusion_matrix.png", "confusion_matrix_normalized.png", "PR_curve.png", "F1_curve.png"):
        candidate = save_dir / filename
        if candidate.exists():
            artifacts.append(to_relative(candidate))

    return {
        "precision": safe_float(results_dict.get("metrics/precision(B)") or getattr(box, "mp", None)),
        "recall": safe_float(results_dict.get("metrics/recall(B)") or getattr(box, "mr", None)),
        "map50": safe_float(results_dict.get("metrics/mAP50(B)") or getattr(box, "map50", None)),
        "map50_95": safe_float(results_dict.get("metrics/mAP50-95(B)") or getattr(box, "map", None)),
        "artifacts": artifacts,
    }


def _save_failure_case(
    *,
    failure_case: dict[str, Any],
    image_path: Path,
    crop: np.ndarray | None,
    failures_dir: Path,
) -> dict[str, Any]:
    images_dir = ensure_directory(failures_dir / "images")
    crops_dir = ensure_directory(failures_dir / "crops")

    saved_image_path = images_dir / image_path.name
    shutil.copy2(image_path, saved_image_path)
    failure_case["saved_image"] = to_relative(saved_image_path)

    if crop is not None:
        crop_filename = f"{image_path.stem}_crop.png"
        saved_crop_path = crops_dir / crop_filename
        cv2.imwrite(str(saved_crop_path), crop)
        failure_case["saved_crop"] = to_relative(saved_crop_path)
    else:
        failure_case["saved_crop"] = None

    return failure_case


def _write_failure_csv(path: Path, failure_cases: list[dict[str, Any]]) -> None:
    ensure_directory(path.parent)
    fieldnames = [
        "image",
        "saved_image",
        "saved_crop",
        "ground_truth",
        "predicted_text",
        "predicted_raw_text",
        "confidence",
        "detection_confidence",
        "validation_status",
        "failure_reason",
    ]

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for case in failure_cases:
            writer.writerow({field: case.get(field) for field in fieldnames})


def _iter_split_images(split_path: Path) -> list[Path]:
    return sorted(path for path in split_path.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)


def render_markdown(summary: dict[str, Any]) -> str:
    detection = summary["evaluation"]["detection_metrics"]
    ocr = summary["evaluation"]["ocr_metrics"]
    e2e = summary["evaluation"]["end_to_end_metrics"]

    lines = [
        "# ANPR End-to-End Evaluation Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Model: `{summary['model_path']}`",
        f"- Dataset: `{summary['dataset']['dataset_name']}`",
        f"- Split: `{summary['evaluation']['split']}`",
        f"- Ground-truth CSV: `{summary['ground_truth_csv']}`",
        f"- Output directory: `{summary['artifacts']['run_directory']}`",
        "",
        "## Executive Summary",
        "",
        f"- Plate detection precision: {detection['precision']}",
        f"- Plate detection recall: {detection['recall']}",
        f"- Plate detection mAP@50: {detection['map50']}",
        f"- OCR exact match rate: {ocr['exact_match_rate']}",
        f"- Character error rate: {ocr['character_error_rate']}",
        f"- End-to-end exact plate match rate: {e2e['exact_match_rate']}",
        "",
        "## Metric Definitions",
        "",
        f"- OCR exact match rate denominator: {ocr['ocr_evaluated_images']} images with a detected crop and OCR text.",
        f"- Character error rate denominator: {ocr['ocr_evaluated_images']} OCR-evaluated images, normalized by total ground-truth characters.",
        f"- End-to-end exact match denominator: {e2e['evaluated_images']} images with ground-truth plate text in the CSV.",
        f"- Images without a matching CSV row: {summary['evaluation']['images_without_ground_truth']}",
        "",
        "## Detection Metrics",
        "",
        f"- Precision: {detection['precision']}",
        f"- Recall: {detection['recall']}",
        f"- mAP@50: {detection['map50']}",
        f"- mAP@50-95: {detection['map50_95']}",
        "",
        "## OCR Metrics",
        "",
        f"- Ground-truth images: {ocr['ground_truth_images']}",
        f"- Images with detected plate crop: {ocr['images_with_detection']}",
        f"- Images with OCR text: {ocr['ocr_evaluated_images']}",
        f"- OCR exact match rate: {ocr['exact_match_rate']}",
        f"- Character error rate: {ocr['character_error_rate']}",
        "",
        "## End-to-End Metrics",
        "",
        f"- Evaluated images: {e2e['evaluated_images']}",
        f"- Exact plate matches: {e2e['exact_matches']}",
        f"- End-to-end exact match rate: {e2e['exact_match_rate']}",
        "",
        "## Artifacts",
        "",
        f"- Summary JSON: `{summary['artifacts']['evaluation_summary_json']}`",
        f"- Summary Markdown: `{summary['artifacts']['evaluation_summary_md']}`",
        f"- Failure manifest JSON: `{summary['artifacts']['failure_cases_json']}`",
        f"- Failure manifest CSV: `{summary['artifacts']['failure_cases_csv']}`",
    ]

    if detection["artifacts"]:
        lines.append("- Detection artifacts:")
        lines.extend(f"  - `{artifact}`" for artifact in detection["artifacts"])

    lines.extend(
        [
            "",
            "## Failure Cases",
            "",
            f"- Total failure cases saved: {summary['evaluation']['failure_case_count']}",
        ]
    )

    sample_failures = summary["failure_cases"][:20]
    if sample_failures:
        lines.extend(
            [
                "",
                "| Image | Ground Truth | Predicted | Confidence | Reason |",
                "| --- | --- | --- | ---: | --- |",
            ]
        )
        for case in sample_failures:
            lines.append(
                "| "
                f"{case['image']} | "
                f"{case['ground_truth'] or 'n/a'} | "
                f"{case['predicted_text'] or 'n/a'} | "
                f"{case['confidence'] if case['confidence'] is not None else 'n/a'} | "
                f"{case['failure_reason']} |"
            )
    else:
        lines.append("")
        lines.append("- No failure cases were recorded.")

    return "\n".join(lines) + "\n"


def evaluate_model(
    *,
    model_path: Path,
    data_path: Path,
    ground_truth_csv: Path,
    split_name: str,
    imgsz: int,
    conf: float,
    iou: float,
) -> dict[str, Any]:
    if split_name not in {"train", "val", "test"}:
        raise ValueError("Split must be one of: train, val, test.")
    if not path_exists(data_path, split_name):
        raise FileNotFoundError(f"Dataset split '{split_name}' is missing from {data_path}")

    output_dir = _default_output_dir(model_path, data_path, split_name)
    failures_dir = ensure_directory(output_dir / "failures")
    dataset_summary = inspect_dataset(data_path)
    split_path = detect_split_path(data_path, split_name)
    if split_path is None:
        raise FileNotFoundError(f"Could not resolve split path for '{split_name}' in {data_path}")

    model = YOLO(str(model_path))
    ground_truth_mapping = _load_ground_truth_mapping(ground_truth_csv)

    detection_metrics = _collect_detection_metrics(
        model=model,
        data_path=data_path,
        split_name=split_name,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        output_dir=output_dir,
    )

    images = _iter_split_images(split_path)
    ground_truth_images = 0
    images_without_ground_truth = 0
    images_with_detection = 0
    ocr_evaluated_images = 0
    ocr_exact_matches = 0
    e2e_exact_matches = 0
    total_character_distance = 0
    total_ground_truth_characters = 0
    failure_cases: list[dict[str, Any]] = []

    for image_path in images:
        ground_truth_entry = _find_ground_truth_for_image(image_path, split_path, ground_truth_mapping)
        if ground_truth_entry is None:
            images_without_ground_truth += 1
            continue

        ground_truth_canonical, ground_truth_display = _normalize_ground_truth_text(
            ground_truth_entry["ground_truth_text"]
        )
        if not ground_truth_canonical:
            images_without_ground_truth += 1
            continue
        ground_truth_images += 1

        results = model.predict(source=str(image_path), imgsz=imgsz, conf=conf, iou=iou, verbose=False)
        best_detection = _extract_best_detection(results[0]) if results else None

        crop = None
        predicted_canonical = None
        predicted_display = None
        predicted_raw_text = None
        predicted_confidence = None
        detection_confidence = best_detection["confidence"] if best_detection else 0.0
        validation_status = "no_plate_detected"
        failure_reason = None
        bbox = best_detection["bbox"] if best_detection else None

        if best_detection is not None:
            crop, expanded_bbox = _crop_highest_confidence_plate(image_path, best_detection)
            if crop is not None:
                bbox = expanded_bbox
                images_with_detection += 1
                ocr_result = _run_ocr_on_crop(crop)
                predicted_canonical = ocr_result["canonical_text"]
                predicted_display = ocr_result["formatted_text"] or ocr_result["canonical_text"]
                predicted_raw_text = ocr_result["raw_text"]
                predicted_confidence = ocr_result["confidence"]
                validation_status = ocr_result["validation_status"]
                if predicted_canonical:
                    ocr_evaluated_images += 1
            else:
                validation_status = "crop_failed"

        if predicted_canonical:
            distance = _levenshtein_distance(predicted_canonical, ground_truth_canonical)
            total_character_distance += distance
            total_ground_truth_characters += len(ground_truth_canonical)
            if predicted_canonical == ground_truth_canonical:
                ocr_exact_matches += 1
                e2e_exact_matches += 1
            else:
                failure_reason = "ocr_mismatch"
        else:
            failure_reason = "no_ocr_prediction" if best_detection is not None else "no_plate_detected"

        if predicted_canonical is not None and predicted_canonical == ground_truth_canonical:
            pass
        elif predicted_canonical is None:
            # End-to-end miss already counted implicitly by not incrementing exact matches.
            pass
        else:
            # OCR mismatch already handled above.
            pass

        if failure_reason is not None:
            failure_case = {
                "image": image_path.name,
                "ground_truth": ground_truth_display,
                "predicted_text": predicted_display,
                "predicted_raw_text": predicted_raw_text,
                "confidence": safe_float(predicted_confidence),
                "detection_confidence": safe_float(detection_confidence),
                "validation_status": validation_status,
                "failure_reason": failure_reason,
                "bbox": bbox,
            }
            failure_cases.append(
                _save_failure_case(
                    failure_case=failure_case,
                    image_path=image_path,
                    crop=crop,
                    failures_dir=failures_dir,
                )
            )

    ocr_exact_match_rate = safe_float(ocr_exact_matches / ocr_evaluated_images if ocr_evaluated_images else None)
    character_error_rate = safe_float(
        total_character_distance / total_ground_truth_characters if total_ground_truth_characters else None
    )
    e2e_exact_match_rate = safe_float(e2e_exact_matches / ground_truth_images if ground_truth_images else None)

    failure_cases_json = output_dir / "failure_cases.json"
    failure_cases_csv = output_dir / "failure_cases.csv"
    write_json(failure_cases_json, {"generated_at": utc_timestamp(), "failure_cases": failure_cases})
    _write_failure_csv(failure_cases_csv, failure_cases)

    summary = {
        "generated_at": utc_timestamp(),
        "run_name": output_dir.name,
        "target": {
            "key": "anpr_e2e",
            "display_name": "ANPR End-to-End Evaluation",
        },
        "model_path": to_relative(model_path),
        "data_path": to_relative(data_path),
        "ground_truth_csv": to_relative(ground_truth_csv),
        "dataset": dataset_summary,
        "evaluation": {
            "split": split_name,
            "imgsz": imgsz,
            "conf": conf,
            "iou": iou,
            "images_in_split": len(images),
            "images_without_ground_truth": images_without_ground_truth,
            "failure_case_count": len(failure_cases),
            "detection_metrics": detection_metrics,
            "ocr_metrics": {
                "ground_truth_images": ground_truth_images,
                "images_with_detection": images_with_detection,
                "ocr_evaluated_images": ocr_evaluated_images,
                "exact_matches": ocr_exact_matches,
                "exact_match_rate": ocr_exact_match_rate,
                "character_error_rate": character_error_rate,
            },
            "end_to_end_metrics": {
                "evaluated_images": ground_truth_images,
                "exact_matches": e2e_exact_matches,
                "exact_match_rate": e2e_exact_match_rate,
            },
        },
        "failure_cases": failure_cases,
        "artifacts": {
            "run_directory": to_relative(output_dir),
            "evaluation_summary_json": to_relative(output_dir / "evaluation_summary.json"),
            "evaluation_summary_md": to_relative(output_dir / "evaluation_summary.md"),
            "failure_cases_json": to_relative(failure_cases_json),
            "failure_cases_csv": to_relative(failure_cases_csv),
            "failure_images_directory": to_relative(failures_dir / "images"),
            "failure_crops_directory": to_relative(failures_dir / "crops"),
        },
    }

    write_json(output_dir / "evaluation_summary.json", summary)
    write_text(output_dir / "evaluation_summary.md", render_markdown(summary))
    return summary


def main() -> None:
    parser = create_parser()
    args = parser.parse_args()

    model_path = resolve_weights_path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model weights not found: {model_path}")

    data_path = Path(args.data)
    if not data_path.is_absolute():
        data_path = (BASE_DIR / data_path).resolve()
    if data_path.is_dir():
        data_path = data_path / "data.yaml"
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_path}")

    ground_truth_csv = Path(args.ground_truth_csv)
    if not ground_truth_csv.is_absolute():
        ground_truth_csv = Path.cwd() / ground_truth_csv
    if not ground_truth_csv.exists():
        raise FileNotFoundError(f"Ground-truth CSV not found: {ground_truth_csv}")

    summary = evaluate_model(
        model_path=model_path.resolve(),
        data_path=data_path.resolve(),
        ground_truth_csv=ground_truth_csv.resolve(),
        split_name=args.split.lower(),
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
    )

    detection = summary["evaluation"]["detection_metrics"]
    ocr = summary["evaluation"]["ocr_metrics"]
    e2e = summary["evaluation"]["end_to_end_metrics"]

    print(f"Completed ANPR end-to-end evaluation: {summary['run_name']}")
    print(
        "Detection | "
        f"precision={detection['precision']} recall={detection['recall']} mAP50={detection['map50']}"
    )
    print(
        "OCR | "
        f"exact_match_rate={ocr['exact_match_rate']} character_error_rate={ocr['character_error_rate']}"
    )
    print(f"End-to-end | exact_match_rate={e2e['exact_match_rate']}")


if __name__ == "__main__":
    main()

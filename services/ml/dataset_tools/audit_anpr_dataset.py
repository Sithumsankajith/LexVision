#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import yaml


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATASETS = [
    BASE_DIR / "datasets" / "NumberPlate" / "Automatic Number Plate Recognition.v9i.yolov8",
    BASE_DIR / "datasets" / "NumberPlate" / "Automatic Plate Number Recognition.v4i.yolov8",
]
DEFAULT_OUTPUT_DIR = BASE_DIR / "evaluation_results" / "anpr"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SPLITS = ("train", "val", "test")
SPLIT_DIR_NAMES = {"train": "train", "val": "valid", "test": "test"}


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_relative(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return str(path.resolve().relative_to(BASE_DIR.resolve()))
    except ValueError:
        return str(path.resolve())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def resolve_dataset_dir(value: str | Path) -> Path:
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
        if not candidate.exists():
            candidate = (BASE_DIR / value).resolve()
    if candidate.name == "data.yaml":
        candidate = candidate.parent
    if not candidate.exists():
        raise FileNotFoundError(f"Dataset directory not found: {value}")
    if not (candidate / "data.yaml").exists():
        raise FileNotFoundError(f"data.yaml not found in dataset directory: {candidate}")
    return candidate.resolve()


def class_names_from_config(config: dict[str, Any]) -> list[str]:
    names = config.get("names", [])
    if isinstance(names, dict):
        return [str(names[key]) for key in sorted(names)]
    return [str(name) for name in names]


def split_image_dir(dataset_dir: Path, split: str) -> Path:
    return dataset_dir / SPLIT_DIR_NAMES[split] / "images"


def split_label_dir(dataset_dir: Path, split: str) -> Path:
    return dataset_dir / SPLIT_DIR_NAMES[split] / "labels"


def list_images(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)


def list_labels(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".txt")


def image_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_image(path: Path) -> dict[str, Any]:
    image = cv2.imread(str(path))
    if image is None:
        return {"ok": False, "width": None, "height": None, "channels": None}
    height, width = image.shape[:2]
    channels = image.shape[2] if len(image.shape) == 3 else 1
    return {"ok": True, "width": int(width), "height": int(height), "channels": int(channels)}


def matching_image_exists(label_path: Path, image_names: set[str]) -> bool:
    return any(f"{label_path.stem}{suffix}" in image_names for suffix in IMAGE_EXTENSIONS)


def bbox_within_image(x_center: float, y_center: float, width: float, height: float) -> bool:
    return (
        x_center - width / 2 >= 0
        and x_center + width / 2 <= 1
        and y_center - height / 2 >= 0
        and y_center + height / 2 <= 1
    )


def analyze_label_file(label_path: Path, class_count: int, split: str, image_name: str) -> dict[str, Any]:
    text = label_path.read_text(encoding="utf-8").strip()
    class_counts: Counter[int] = Counter()
    invalid_rows: list[dict[str, Any]] = []
    if not text:
        return {"class_counts": class_counts, "invalid_rows": invalid_rows, "empty": True, "annotation_count": 0}

    annotation_count = 0
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        reason = None
        if len(parts) != 5:
            reason = "expected 5 YOLO detection fields"
        else:
            try:
                class_id = int(float(parts[0]))
                x_center = float(parts[1])
                y_center = float(parts[2])
                width = float(parts[3])
                height = float(parts[4])
            except ValueError:
                reason = "non-numeric annotation values"
            else:
                if class_id < 0 or class_id >= class_count:
                    reason = f"class id {class_id} outside declared range"
                elif not (0 <= x_center <= 1 and 0 <= y_center <= 1):
                    reason = "center coordinates outside [0, 1]"
                elif not (0 < width <= 1 and 0 < height <= 1):
                    reason = "width/height outside (0, 1]"
                elif not bbox_within_image(x_center, y_center, width, height):
                    reason = "bbox extends outside normalized image bounds"
                else:
                    class_counts[class_id] += 1
                    annotation_count += 1

        if reason:
            invalid_rows.append(
                {
                    "split": split,
                    "image": image_name,
                    "label_file": to_relative(label_path),
                    "line_number": line_number,
                    "line": stripped,
                    "reason": reason,
                }
            )

    return {
        "class_counts": class_counts,
        "invalid_rows": invalid_rows,
        "empty": False,
        "annotation_count": annotation_count,
    }


def split_ratio(split_image_counts: dict[str, int]) -> dict[str, float]:
    total = sum(split_image_counts.values())
    if total == 0:
        return {split: 0.0 for split in SPLITS}
    return {split: round((split_image_counts.get(split, 0) / total) * 100, 2) for split in SPLITS}


def infer_country_suitability(config: dict[str, Any], dataset_name: str, class_names: list[str]) -> dict[str, Any]:
    roboflow = config.get("roboflow") or {}
    text = " ".join(
        [
            dataset_name,
            str(roboflow.get("workspace", "")),
            str(roboflow.get("project", "")),
            str(roboflow.get("url", "")),
            " ".join(class_names),
        ]
    ).lower()
    sri_lanka_terms = ("sri", "lanka", "lk", "ceylon")
    detected = [term for term in sri_lanka_terms if re.search(rf"\b{re.escape(term)}\b", text)]
    if detected:
        assessment = "Dataset metadata contains Sri Lanka indicators; visually verify sample diversity before final training."
    else:
        assessment = (
            "No Sri Lanka-specific metadata was found. The dataset is usable for plate localization, "
            "but OCR normalization and final enforcement still require officer verification on Sri Lankan plates."
        )
    return {"metadata_indicators": detected, "assessment": assessment}


def audit_dataset(dataset_dir: Path) -> dict[str, Any]:
    dataset_dir = resolve_dataset_dir(dataset_dir)
    data_yaml = dataset_dir / "data.yaml"
    config = read_yaml(data_yaml)
    class_names = class_names_from_config(config)
    class_count = int(config.get("nc") or len(class_names))

    split_summaries: dict[str, Any] = {}
    duplicate_groups: dict[str, list[str]] = defaultdict(list)
    totals = Counter()
    total_class_counts: Counter[str] = Counter({name: 0 for name in class_names})
    samples = {
        "missing_label_examples": [],
        "missing_image_examples": [],
        "corrupt_image_examples": [],
        "invalid_bbox_examples": [],
        "duplicate_image_examples": [],
    }

    for split in SPLITS:
        images = list_images(split_image_dir(dataset_dir, split))
        labels = list_labels(split_label_dir(dataset_dir, split))
        image_names = {image.name for image in images}
        label_names = {label.name for label in labels}

        split_class_counts: Counter[str] = Counter({name: 0 for name in class_names})
        missing_labels = []
        missing_images = []
        corrupt_images = []
        invalid_rows: list[dict[str, Any]] = []
        empty_labels = 0
        annotation_count = 0

        for image_path in images:
            fingerprint = image_fingerprint(image_path)
            duplicate_groups[fingerprint].append(to_relative(image_path) or str(image_path))

            image_info = inspect_image(image_path)
            if not image_info["ok"]:
                corrupt_images.append(to_relative(image_path) or str(image_path))

            label_path = split_label_dir(dataset_dir, split) / f"{image_path.stem}.txt"
            if not label_path.exists():
                missing_labels.append(to_relative(image_path) or str(image_path))
                continue

            analysis = analyze_label_file(label_path, class_count, split, image_path.name)
            empty_labels += 1 if analysis["empty"] else 0
            annotation_count += analysis["annotation_count"]
            invalid_rows.extend(analysis["invalid_rows"])
            for class_id, count in analysis["class_counts"].items():
                class_name = class_names[class_id] if class_id < len(class_names) else f"class_{class_id}"
                split_class_counts[class_name] += count

        for label_path in labels:
            if not matching_image_exists(label_path, image_names):
                missing_images.append(to_relative(label_path) or str(label_path))

        for class_name, count in split_class_counts.items():
            total_class_counts[class_name] += count

        split_summary = {
            "image_count": len(images),
            "label_count": len(labels),
            "annotation_count": annotation_count,
            "missing_labels": len(missing_labels),
            "missing_images": len(missing_images),
            "corrupt_images": len(corrupt_images),
            "empty_labels": empty_labels,
            "invalid_bounding_boxes": len(invalid_rows),
            "class_counts": dict(split_class_counts),
            "image_directory": to_relative(split_image_dir(dataset_dir, split)),
            "label_directory": to_relative(split_label_dir(dataset_dir, split)),
        }
        split_summaries[split] = split_summary
        totals.update(
            {
                "image_count": len(images),
                "label_count": len(labels),
                "annotation_count": annotation_count,
                "missing_labels": len(missing_labels),
                "missing_images": len(missing_images),
                "corrupt_images": len(corrupt_images),
                "empty_labels": empty_labels,
                "invalid_bounding_boxes": len(invalid_rows),
            }
        )

        samples["missing_label_examples"].extend(missing_labels[: max(0, 10 - len(samples["missing_label_examples"]))])
        samples["missing_image_examples"].extend(missing_images[: max(0, 10 - len(samples["missing_image_examples"]))])
        samples["corrupt_image_examples"].extend(corrupt_images[: max(0, 10 - len(samples["corrupt_image_examples"]))])
        samples["invalid_bbox_examples"].extend(invalid_rows[: max(0, 10 - len(samples["invalid_bbox_examples"]))])

    duplicate_image_groups = [paths for paths in duplicate_groups.values() if len(paths) > 1]
    duplicate_image_count = sum(len(paths) for paths in duplicate_image_groups)
    samples["duplicate_image_examples"] = duplicate_image_groups[:5]
    totals["duplicate_images"] = duplicate_image_count

    image_counts = {split: split_summaries[split]["image_count"] for split in SPLITS}
    single_class = class_count == 1
    suitability = infer_country_suitability(config, dataset_dir.name, class_names)
    structural_score = (
        totals["image_count"]
        - totals["missing_labels"] * 2
        - totals["missing_images"] * 2
        - totals["corrupt_images"] * 5
        - totals["invalid_bounding_boxes"] * 3
        - duplicate_image_count
    )

    return {
        "dataset_name": dataset_dir.name,
        "dataset_dir": to_relative(dataset_dir),
        "data_yaml": to_relative(data_yaml),
        "data_yaml_raw": config,
        "class_count": class_count,
        "class_names": class_names,
        "task_type": "single-class plate detection" if single_class else "multi-class object detection",
        "single_class_plate_detection": single_class,
        "splits": split_summaries,
        "split_ratio_percent": split_ratio(image_counts),
        "totals": {
            **dict(totals),
            "class_counts": dict(total_class_counts),
            "duplicate_image_groups": len(duplicate_image_groups),
        },
        "issues": {
            "missing_labels": totals["missing_labels"],
            "missing_images": totals["missing_images"],
            "corrupt_images": totals["corrupt_images"],
            "invalid_bounding_boxes": totals["invalid_bounding_boxes"],
            "duplicate_images": duplicate_image_count,
            "empty_labels": totals["empty_labels"],
        },
        "sri_lankan_plate_suitability": suitability,
        "samples": samples,
        "selection_score": structural_score,
    }


def recommend_dataset(audits: list[dict[str, Any]]) -> dict[str, Any]:
    if not audits:
        raise ValueError("No datasets were audited.")
    selected = max(
        audits,
        key=lambda item: (
            item["selection_score"],
            item["totals"]["image_count"],
            -item["issues"]["invalid_bounding_boxes"],
            -item["issues"]["corrupt_images"],
        ),
    )
    reasons = [
        f"Highest structural score ({selected['selection_score']}) among audited datasets.",
        f"Largest usable image pool or tied image pool ({selected['totals']['image_count']} total images).",
        "Single-class plate detector target matches the LexVision ANPR detector stage."
        if selected["single_class_plate_detection"]
        else "Selected despite multi-class configuration; review class mapping before training.",
    ]
    if selected["issues"]["invalid_bounding_boxes"] == 0 and selected["issues"]["corrupt_images"] == 0:
        reasons.append("No corrupt images or invalid bounding boxes were found by the audit.")
    reasons.append(selected["sri_lankan_plate_suitability"]["assessment"])
    return {
        "selected_dataset_name": selected["dataset_name"],
        "selected_data_yaml": selected["data_yaml"],
        "selected_dataset_dir": selected["dataset_dir"],
        "reasons": reasons,
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# ANPR Dataset Audit Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Selected dataset: `{summary['recommendation']['selected_dataset_name']}`",
        f"- Selected data YAML: `{summary['recommendation']['selected_data_yaml']}`",
        "",
        "## Recommendation",
        "",
    ]
    lines.extend(f"- {reason}" for reason in summary["recommendation"]["reasons"])
    lines.extend(["", "## Dataset Comparison", ""])
    lines.extend(
        [
            "| Dataset | Classes | Train | Val | Test | Labels | Missing Labels | Missing Images | Corrupt | Invalid Boxes | Duplicate Images | Split Ratio | Task | Sri Lanka Suitability |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
        ]
    )
    for audit in summary["datasets"]:
        splits = audit["splits"]
        ratio = audit["split_ratio_percent"]
        lines.append(
            "| "
            f"{audit['dataset_name']} | "
            f"{', '.join(audit['class_names']) or 'n/a'} | "
            f"{splits['train']['image_count']} | "
            f"{splits['val']['image_count']} | "
            f"{splits['test']['image_count']} | "
            f"{audit['totals']['label_count']} | "
            f"{audit['issues']['missing_labels']} | "
            f"{audit['issues']['missing_images']} | "
            f"{audit['issues']['corrupt_images']} | "
            f"{audit['issues']['invalid_bounding_boxes']} | "
            f"{audit['issues']['duplicate_images']} | "
            f"{ratio['train']}% / {ratio['val']}% / {ratio['test']}% | "
            f"{audit['task_type']} | "
            f"{audit['sri_lankan_plate_suitability']['assessment']} |"
        )

    for audit in summary["datasets"]:
        lines.extend(
            [
                "",
                f"## {audit['dataset_name']}",
                "",
                f"- data.yaml: `{audit['data_yaml']}`",
                f"- Class names: {', '.join(audit['class_names']) or 'n/a'}",
                f"- Single-class plate detection: {'Yes' if audit['single_class_plate_detection'] else 'No'}",
                f"- Split ratio: train {audit['split_ratio_percent']['train']}%, validation {audit['split_ratio_percent']['val']}%, test {audit['split_ratio_percent']['test']}%",
                "",
                "| Split | Images | Labels | Annotations | Missing Labels | Missing Images | Corrupt Images | Empty Labels | Invalid Boxes |",
                "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for split in SPLITS:
            payload = audit["splits"][split]
            lines.append(
                "| "
                f"{split} | "
                f"{payload['image_count']} | "
                f"{payload['label_count']} | "
                f"{payload['annotation_count']} | "
                f"{payload['missing_labels']} | "
                f"{payload['missing_images']} | "
                f"{payload['corrupt_images']} | "
                f"{payload['empty_labels']} | "
                f"{payload['invalid_bounding_boxes']} |"
            )
        if audit["samples"]["invalid_bbox_examples"]:
            lines.extend(["", "Invalid bounding box examples:"])
            lines.extend(
                f"- `{item['label_file']}` line {item['line_number']}: {item['reason']}"
                for item in audit["samples"]["invalid_bbox_examples"][:5]
            )
        if audit["samples"]["duplicate_image_examples"]:
            lines.extend(["", "Duplicate image examples:"])
            for group in audit["samples"]["duplicate_image_examples"]:
                lines.append(f"- {'; '.join(f'`{path}`' for path in group[:4])}")

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This audit verifies dataset structure and annotation quality. It does not claim that either dataset is Sri Lanka-specific unless the dataset metadata says so.",
            "- Officer verification remains mandatory before enforcement because OCR errors and non-local plate layouts can still pass detector validation.",
        ]
    )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit LexVision ANPR YOLOv8 datasets.")
    parser.add_argument(
        "--datasets",
        nargs="*",
        default=[str(path) for path in DEFAULT_DATASETS],
        help="Dataset directories or data.yaml paths. Defaults to both LexVision NumberPlate datasets.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory for dataset_audit_report.md/json.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    audits = [audit_dataset(resolve_dataset_dir(item)) for item in args.datasets]
    summary = {
        "generated_at": utc_timestamp(),
        "datasets": audits,
        "recommendation": recommend_dataset(audits),
        "artifacts": {
            "json": to_relative(output_dir / "dataset_audit_report.json"),
            "markdown": to_relative(output_dir / "dataset_audit_report.md"),
        },
    }
    write_json(output_dir / "dataset_audit_report.json", summary)
    write_text(output_dir / "dataset_audit_report.md", render_markdown(summary))
    print(f"Wrote {output_dir / 'dataset_audit_report.json'}")
    print(f"Wrote {output_dir / 'dataset_audit_report.md'}")
    print(f"Recommended dataset: {summary['recommendation']['selected_dataset_name']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ANPR dataset audit failed: {exc}", file=sys.stderr)
        raise

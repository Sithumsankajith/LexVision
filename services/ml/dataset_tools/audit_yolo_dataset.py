from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE_DIR = Path(__file__).resolve().parents[1]
TRAINING_DIR = BASE_DIR / "training"
DEFAULT_OUTPUT_ROOT = Path(__file__).resolve().parent / "reports"

if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from common import (  # type: ignore[attr-defined]
    IMAGE_EXTENSIONS,
    detect_split_path,
    ensure_directory,
    read_yaml,
    safe_float,
    to_relative,
    utc_timestamp,
    write_json,
    write_text,
)

SPLIT_LABEL_DIR_CANDIDATES = {
    "train": "train",
    "val": "valid",
    "test": "test",
}


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit a YOLO-format dataset for split sizes, label quality, class balance, and annotation issues."
    )
    parser.add_argument(
        "--data",
        type=str,
        required=True,
        help="Path to a YOLO dataset directory or its data.yaml file.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Optional output directory. Defaults to services/ml/dataset_tools/reports/<dataset_name>/.",
    )
    return parser


def _sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "dataset"


def _resolve_dataset_yaml(data_arg: str) -> Path:
    raw_candidate = Path(data_arg)
    candidates = [raw_candidate]
    if not raw_candidate.is_absolute():
        candidates.extend([(Path.cwd() / raw_candidate), (BASE_DIR / raw_candidate)])

    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_dir():
            resolved = resolved / "data.yaml"
        if resolved.exists():
            return resolved

    raise FileNotFoundError(f"Dataset config not found: {data_arg}")


def _resolve_class_names(config: dict[str, Any]) -> list[str]:
    names = config.get("names", [])
    if isinstance(names, dict):
        return [names[key] for key in sorted(names)]
    return list(names)


def _resolve_images_for_split(dataset_yaml: Path, split_name: str) -> list[Path]:
    split_path = detect_split_path(dataset_yaml, split_name)
    if split_path is None or not split_path.exists():
        return []
    return sorted(
        path
        for path in split_path.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def _resolve_label_directory(dataset_yaml: Path, split_name: str) -> Path | None:
    split_path = detect_split_path(dataset_yaml, split_name)
    if split_path is None:
        return None

    candidate = split_path.parent / "labels"
    if candidate.exists():
        return candidate.resolve()

    fallback_name = SPLIT_LABEL_DIR_CANDIDATES.get(split_name, split_name)
    fallback = dataset_yaml.parent / fallback_name / "labels"
    if fallback.exists():
        return fallback.resolve()
    return None


def _bbox_edges_within_frame(x_center: float, y_center: float, width: float, height: float) -> bool:
    left = x_center - width / 2
    right = x_center + width / 2
    top = y_center - height / 2
    bottom = y_center + height / 2
    return left >= 0.0 and right <= 1.0 and top >= 0.0 and bottom <= 1.0


def _analyze_label_file(
    *,
    label_path: Path,
    class_names: list[str],
    dataset_yaml: Path,
    split_name: str,
    image_name: str,
) -> dict[str, Any]:
    raw_text = label_path.read_text(encoding="utf-8").strip()
    if not raw_text:
        return {
            "class_counts": Counter(),
            "invalid_annotations": [],
            "is_empty": True,
        }

    class_counts: Counter[int] = Counter()
    invalid_annotations: list[dict[str, Any]] = []
    total_classes = len(class_names)

    for line_number, raw_line in enumerate(raw_text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue

        parts = stripped.split()
        if len(parts) != 5:
            invalid_annotations.append(
                {
                    "split": split_name,
                    "image": image_name,
                    "label_file": to_relative(label_path),
                    "line_number": line_number,
                    "line": stripped,
                    "reason": "expected 5 YOLO detection fields",
                }
            )
            continue

        try:
            class_id = int(float(parts[0]))
            x_center = float(parts[1])
            y_center = float(parts[2])
            width = float(parts[3])
            height = float(parts[4])
        except ValueError:
            invalid_annotations.append(
                {
                    "split": split_name,
                    "image": image_name,
                    "label_file": to_relative(label_path),
                    "line_number": line_number,
                    "line": stripped,
                    "reason": "non-numeric annotation values",
                }
            )
            continue

        reason = None
        if class_id < 0 or class_id >= total_classes:
            reason = f"class id {class_id} is outside declared range 0..{max(total_classes - 1, 0)}"
        elif not (0.0 <= x_center <= 1.0 and 0.0 <= y_center <= 1.0):
            reason = "center coordinates must be within [0, 1]"
        elif not (0.0 < width <= 1.0 and 0.0 < height <= 1.0):
            reason = "bbox width and height must be within (0, 1]"
        elif not _bbox_edges_within_frame(x_center, y_center, width, height):
            reason = "bbox extends outside normalized image bounds"

        if reason is not None:
            invalid_annotations.append(
                {
                    "split": split_name,
                    "image": image_name,
                    "label_file": to_relative(label_path),
                    "line_number": line_number,
                    "line": stripped,
                    "reason": reason,
                }
            )
            continue

        class_counts[class_id] += 1

    return {
        "class_counts": class_counts,
        "invalid_annotations": invalid_annotations,
        "is_empty": False,
    }


def _compute_imbalance(overall_class_counts: dict[str, int]) -> dict[str, Any]:
    non_zero = {name: count for name, count in overall_class_counts.items() if count > 0}
    if not non_zero:
        return {
            "status": "no_annotations",
            "majority_class": None,
            "minority_class": None,
            "majority_count": 0,
            "minority_count": 0,
            "minority_to_majority_ratio": None,
            "severity": "unknown",
        }

    majority_class, majority_count = max(non_zero.items(), key=lambda item: item[1])
    minority_class, minority_count = min(non_zero.items(), key=lambda item: item[1])
    ratio = minority_count / majority_count if majority_count else None

    if ratio is None:
        severity = "unknown"
    elif ratio < 0.1:
        severity = "severe"
    elif ratio < 0.25:
        severity = "moderate"
    else:
        severity = "acceptable"

    return {
        "status": "computed",
        "majority_class": majority_class,
        "minority_class": minority_class,
        "majority_count": majority_count,
        "minority_count": minority_count,
        "minority_to_majority_ratio": safe_float(ratio, digits=4),
        "severity": severity,
    }


def _build_recommendations(summary: dict[str, Any]) -> list[str]:
    recommendations: list[str] = []
    issues = summary["issues"]
    imbalance = summary["class_imbalance"]
    split_stats = summary["splits"]

    if issues["missing_label_files"] > 0:
        recommendations.append(
            f"Create label files for the {issues['missing_label_files']} images that are missing annotations, "
            "or remove those images if they should not be in the dataset."
        )

    if issues["empty_label_files"] > 0:
        recommendations.append(
            f"Review the {issues['empty_label_files']} empty label files. Keep them only if they are intentional "
            "negative samples; otherwise annotate or remove them."
        )

    if issues["invalid_bounding_boxes"] > 0:
        recommendations.append(
            f"Fix the {issues['invalid_bounding_boxes']} invalid bounding boxes before training. "
            "Out-of-range boxes and malformed rows directly hurt detector learning."
        )

    if issues["orphan_label_files"] > 0:
        recommendations.append(
            f"Clean up the {issues['orphan_label_files']} label files that do not have matching images."
        )

    if imbalance["severity"] == "severe":
        recommendations.append(
            f"Class imbalance is severe: `{imbalance['minority_class']}` has only "
            f"{imbalance['minority_to_majority_ratio']}x the annotations of `{imbalance['majority_class']}`. "
            "Collect more minority-class examples or rebalance with targeted augmentation."
        )
    elif imbalance["severity"] == "moderate":
        recommendations.append(
            f"Class imbalance is moderate between `{imbalance['minority_class']}` and `{imbalance['majority_class']}`. "
            "Bias in recall is likely unless you add more minority-class samples."
        )

    for split_name, payload in split_stats.items():
        if payload["image_count"] == 0:
            recommendations.append(
                f"The `{split_name}` split has no images. Rebuild the dataset split before training or evaluation."
            )
            continue

        if split_name == "test" and payload["image_count"] < 50:
            recommendations.append(
                f"The test split only has {payload['image_count']} images. Increase it to improve evaluation reliability."
            )

        zero_classes = [name for name, count in payload["class_counts"].items() if count == 0]
        if zero_classes and len(zero_classes) < len(payload["class_counts"]):
            recommendations.append(
                f"The `{split_name}` split has classes with zero annotations ({', '.join(zero_classes[:5])}). "
                "Use a stratified split so every important class appears in validation and test."
            )

    if not recommendations:
        recommendations.append(
            "No critical structural issues were found. Next improvements should focus on more data diversity: "
            "lighting, angles, occlusion, blur, and harder minority-class examples."
        )

    return recommendations


def _plot_class_distribution(
    *,
    output_dir: Path,
    class_names: list[str],
    overall_counts: dict[str, int],
    split_class_counts: dict[str, dict[str, int]],
) -> dict[str, str]:
    charts_dir = ensure_directory(output_dir / "charts")
    overall_chart_path = charts_dir / "class_distribution_overall.png"
    split_chart_path = charts_dir / "class_distribution_by_split.png"

    plt.figure(figsize=(max(8, len(class_names) * 1.4), 5))
    plt.bar(class_names, [overall_counts[name] for name in class_names], color="#2563eb")
    plt.title("Overall Class Distribution")
    plt.ylabel("Label Count")
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    plt.savefig(overall_chart_path, dpi=150)
    plt.close()

    x = list(range(len(class_names)))
    width = 0.25
    split_order = [split for split in ("train", "val", "test") if split in split_class_counts]
    offsets = {
        "train": -width,
        "val": 0.0,
        "test": width,
    }
    colors = {
        "train": "#2563eb",
        "val": "#f59e0b",
        "test": "#16a34a",
    }

    plt.figure(figsize=(max(9, len(class_names) * 1.6), 5.5))
    for split_name in split_order:
        counts = [split_class_counts[split_name].get(name, 0) for name in class_names]
        positions = [item + offsets[split_name] for item in x]
        plt.bar(positions, counts, width=width, label=split_name, color=colors[split_name])
    plt.title("Class Distribution by Split")
    plt.ylabel("Label Count")
    plt.xticks(x, class_names, rotation=30, ha="right")
    plt.legend()
    plt.tight_layout()
    plt.savefig(split_chart_path, dpi=150)
    plt.close()

    return {
        "overall_class_distribution": to_relative(overall_chart_path),
        "split_class_distribution": to_relative(split_chart_path),
    }


def _render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# YOLO Dataset Audit Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Dataset: `{summary['dataset']['dataset_name']}`",
        f"- Data YAML: `{summary['dataset']['data_yaml']}`",
        f"- Classes: {', '.join(summary['dataset']['class_names']) if summary['dataset']['class_names'] else 'n/a'}",
        "",
        "## Overview",
        "",
        f"- Total images: {summary['totals']['image_count']}",
        f"- Total label files: {summary['totals']['label_file_count']}",
        f"- Total annotations: {summary['totals']['annotation_count']}",
        f"- Missing label files: {summary['issues']['missing_label_files']}",
        f"- Empty label files: {summary['issues']['empty_label_files']}",
        f"- Invalid bounding boxes: {summary['issues']['invalid_bounding_boxes']}",
        f"- Orphan label files: {summary['issues']['orphan_label_files']}",
        "",
        "## Class Balance",
        "",
        f"- Majority class: {summary['class_imbalance']['majority_class'] or 'n/a'} ({summary['class_imbalance']['majority_count']})",
        f"- Minority class: {summary['class_imbalance']['minority_class'] or 'n/a'} ({summary['class_imbalance']['minority_count']})",
        f"- Minority/Majority ratio: {summary['class_imbalance']['minority_to_majority_ratio'] if summary['class_imbalance']['minority_to_majority_ratio'] is not None else 'n/a'}",
        f"- Imbalance severity: {summary['class_imbalance']['severity']}",
        "",
        "## Split Summary",
        "",
        "| Split | Images | Labels | Missing Labels | Empty Labels | Invalid Boxes |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]

    for split_name, payload in summary["splits"].items():
        lines.append(
            "| "
            f"{split_name} | "
            f"{payload['image_count']} | "
            f"{payload['label_file_count']} | "
            f"{payload['missing_label_files']} | "
            f"{payload['empty_label_files']} | "
            f"{payload['invalid_bounding_boxes']} |"
        )

    lines.extend(
        [
            "",
            "## Class Counts",
            "",
            "| Class | Total Labels | Train | Val | Test |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )

    for class_name in summary["dataset"]["class_names"]:
        total = summary["totals"]["class_counts"][class_name]
        train = summary["splits"].get("train", {}).get("class_counts", {}).get(class_name, 0)
        val = summary["splits"].get("val", {}).get("class_counts", {}).get(class_name, 0)
        test = summary["splits"].get("test", {}).get("class_counts", {}).get(class_name, 0)
        lines.append(f"| {class_name} | {total} | {train} | {val} | {test} |")

    lines.extend(
        [
            "",
            "## Charts",
            "",
            f"- Overall class distribution: `{summary['artifacts']['charts']['overall_class_distribution']}`",
            f"- Split class distribution: `{summary['artifacts']['charts']['split_class_distribution']}`",
            "",
            "## Recommendations",
            "",
        ]
    )
    lines.extend(f"- {item}" for item in summary["recommendations"])

    if summary["samples"]["missing_label_examples"] or summary["samples"]["invalid_bbox_examples"]:
        lines.extend(["", "## Sample Issues", ""])

    if summary["samples"]["missing_label_examples"]:
        lines.append("### Missing Label Examples")
        lines.append("")
        lines.extend(f"- `{item}`" for item in summary["samples"]["missing_label_examples"])
        lines.append("")

    if summary["samples"]["invalid_bbox_examples"]:
        lines.append("### Invalid Bounding Box Examples")
        lines.append("")
        for item in summary["samples"]["invalid_bbox_examples"]:
            lines.append(
                f"- `{item['label_file']}` line {item['line_number']} ({item['image']}): {item['reason']}"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def audit_dataset(dataset_yaml: Path, output_dir: Path | None = None) -> dict[str, Any]:
    config = read_yaml(dataset_yaml)
    class_names = _resolve_class_names(config)
    dataset_name = dataset_yaml.parent.name
    report_dir = ensure_directory(
        output_dir.resolve() if output_dir else DEFAULT_OUTPUT_ROOT / _sanitize_name(dataset_name)
    )

    split_summaries: dict[str, Any] = {}
    total_class_counts: Counter[str] = Counter({name: 0 for name in class_names})
    total_images = 0
    total_label_files = 0
    total_annotations = 0
    total_missing_labels = 0
    total_empty_labels = 0
    total_invalid_annotations = 0
    total_orphan_label_files = 0

    missing_label_examples: list[str] = []
    invalid_bbox_examples: list[dict[str, Any]] = []
    orphan_label_examples: list[str] = []

    for split_name in ("train", "val", "test"):
        images = _resolve_images_for_split(dataset_yaml, split_name)
        label_dir = _resolve_label_directory(dataset_yaml, split_name)
        image_names = {image.name for image in images}
        label_files = sorted(label_dir.glob("*.txt")) if label_dir else []
        label_names = {label_file.name for label_file in label_files}

        split_class_counts: Counter[str] = Counter({name: 0 for name in class_names})
        split_missing_labels = 0
        split_empty_labels = 0
        split_invalid_annotations = 0
        split_annotation_count = 0
        split_orphan_label_files = 0
        invalid_annotation_entries: list[dict[str, Any]] = []

        for image_path in images:
            label_path = label_dir / f"{image_path.stem}.txt" if label_dir else None
            if label_path is None or not label_path.exists():
                split_missing_labels += 1
                if len(missing_label_examples) < 10:
                    missing_label_examples.append(to_relative(image_path))
                continue

            analysis = _analyze_label_file(
                label_path=label_path,
                class_names=class_names,
                dataset_yaml=dataset_yaml,
                split_name=split_name,
                image_name=image_path.name,
            )
            if analysis["is_empty"]:
                split_empty_labels += 1

            for class_id, count in analysis["class_counts"].items():
                class_name = class_names[class_id]
                split_class_counts[class_name] += count
                split_annotation_count += count

            split_invalid_annotations += len(analysis["invalid_annotations"])
            invalid_annotation_entries.extend(analysis["invalid_annotations"])
            if len(invalid_bbox_examples) < 10:
                remaining = 10 - len(invalid_bbox_examples)
                invalid_bbox_examples.extend(analysis["invalid_annotations"][:remaining])

        for label_file in label_files:
            matching_image_exists = any(
                f"{label_file.stem}{suffix}" in image_names for suffix in IMAGE_EXTENSIONS
            )
            if not matching_image_exists:
                split_orphan_label_files += 1
                if len(orphan_label_examples) < 10:
                    orphan_label_examples.append(to_relative(label_file))

        total_images += len(images)
        total_label_files += len(label_files)
        total_annotations += split_annotation_count
        total_missing_labels += split_missing_labels
        total_empty_labels += split_empty_labels
        total_invalid_annotations += split_invalid_annotations
        total_orphan_label_files += split_orphan_label_files

        for class_name, count in split_class_counts.items():
            total_class_counts[class_name] += count

        split_summaries[split_name] = {
            "image_count": len(images),
            "label_file_count": len(label_files),
            "annotation_count": split_annotation_count,
            "missing_label_files": split_missing_labels,
            "empty_label_files": split_empty_labels,
            "invalid_bounding_boxes": split_invalid_annotations,
            "orphan_label_files": split_orphan_label_files,
            "class_counts": dict(split_class_counts),
            "label_directory": to_relative(label_dir) if label_dir else None,
            "invalid_annotation_examples": invalid_annotation_entries[:10],
        }

    imbalance = _compute_imbalance(dict(total_class_counts))
    charts = _plot_class_distribution(
        output_dir=report_dir,
        class_names=class_names,
        overall_counts=dict(total_class_counts),
        split_class_counts={split: payload["class_counts"] for split, payload in split_summaries.items()},
    )

    summary = {
        "generated_at": utc_timestamp(),
        "dataset": {
            "dataset_name": dataset_name,
            "data_yaml": to_relative(dataset_yaml),
            "class_count": len(class_names),
            "class_names": class_names,
        },
        "splits": split_summaries,
        "totals": {
            "image_count": total_images,
            "label_file_count": total_label_files,
            "annotation_count": total_annotations,
            "class_counts": dict(total_class_counts),
        },
        "issues": {
            "missing_label_files": total_missing_labels,
            "empty_label_files": total_empty_labels,
            "invalid_bounding_boxes": total_invalid_annotations,
            "orphan_label_files": total_orphan_label_files,
        },
        "class_imbalance": imbalance,
        "samples": {
            "missing_label_examples": missing_label_examples,
            "invalid_bbox_examples": invalid_bbox_examples,
            "orphan_label_examples": orphan_label_examples,
        },
        "artifacts": {
            "report_directory": to_relative(report_dir),
            "audit_report_json": to_relative(report_dir / "audit_report.json"),
            "audit_report_md": to_relative(report_dir / "audit_report.md"),
            "charts": charts,
        },
    }
    summary["recommendations"] = _build_recommendations(summary)

    write_json(report_dir / "audit_report.json", summary)
    write_text(report_dir / "audit_report.md", _render_markdown(summary))
    return summary


def main() -> None:
    parser = create_parser()
    args = parser.parse_args()

    dataset_yaml = _resolve_dataset_yaml(args.data)
    output_dir = None
    if args.output_dir:
        output_dir = Path(args.output_dir)
        if not output_dir.is_absolute():
            output_dir = (Path.cwd() / output_dir).resolve()

    summary = audit_dataset(dataset_yaml=dataset_yaml, output_dir=output_dir)
    print(f"Completed dataset audit: {summary['dataset']['dataset_name']}")
    print(
        "Summary | "
        f"images={summary['totals']['image_count']} "
        f"annotations={summary['totals']['annotation_count']} "
        f"missing_labels={summary['issues']['missing_label_files']} "
        f"empty_labels={summary['issues']['empty_label_files']} "
        f"invalid_bboxes={summary['issues']['invalid_bounding_boxes']}"
    )


if __name__ == "__main__":
    main()

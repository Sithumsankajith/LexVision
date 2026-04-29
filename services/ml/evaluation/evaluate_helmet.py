from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parents[1]
TRAINING_DIR = BASE_DIR / "training"
RESULTS_DIR = Path(__file__).resolve().parent / "results"

if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))

from common import (  # type: ignore[attr-defined]
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

VALID_SPLITS = {"train", "val", "test"}
NO_HELMET_LABEL_ALIASES = {
    "nohelmet",
    "nohelmetrider",
    "notwearinghelmet",
    "notwearinghelment",
    "withouthelmet",
    "no_helmet",
}


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Evaluate a YOLOv8 helmet model and save report-ready metrics for train/val/test splits."
    )
    parser.add_argument("--model", type=str, required=True, help="Path to the YOLOv8 helmet weights file.")
    parser.add_argument("--data", type=str, required=True, help="Path to the dataset data.yaml file.")
    parser.add_argument(
        "--split",
        type=str,
        default="train,val,test",
        help="Comma-separated split list to evaluate. Defaults to train,val,test.",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Evaluation image size.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold for evaluation.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold for evaluation.")
    return parser


def _sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "run"


def _parse_requested_splits(raw_value: str) -> list[str]:
    requested = [item.strip().lower() for item in raw_value.split(",") if item.strip()]
    if not requested:
        return ["train", "val", "test"]

    invalid = [item for item in requested if item not in VALID_SPLITS]
    if invalid:
        valid = ", ".join(sorted(VALID_SPLITS))
        raise ValueError(f"Invalid split value(s): {', '.join(invalid)}. Expected any of: {valid}")

    seen: set[str] = set()
    ordered: list[str] = []
    for split_name in requested:
        if split_name not in seen:
            ordered.append(split_name)
            seen.add(split_name)
    return ordered


def _default_output_dir(model_path: Path, data_path: Path) -> Path:
    run_name = _sanitize_name(f"helmet_eval_{model_path.stem}_{data_path.parent.name}")
    return ensure_directory(RESULTS_DIR / run_name)


def _extract_class_names(metrics: Any, dataset_summary: dict[str, Any]) -> list[str]:
    class_names = dataset_summary.get("class_names") or []
    if class_names:
        return list(class_names)

    names = getattr(metrics, "names", {}) or {}
    if isinstance(names, dict):
        return [names[key] for key in sorted(names)]
    return list(names)


def _macro_f1(metrics: Any) -> float | None:
    box = getattr(metrics, "box", None)
    values = getattr(box, "f1", None) if box is not None else None
    if values is None:
        return None

    try:
        return safe_float(values.mean())
    except AttributeError:
        values_list = list(values)
        if not values_list:
            return None
        return safe_float(sum(values_list) / len(values_list))


def _extract_per_class_metrics(metrics: Any, class_names: list[str]) -> list[dict[str, Any]]:
    box = getattr(metrics, "box", None)
    if box is None:
        return []

    entries = [
        {
            "class_index": index,
            "class_name": class_name,
            "precision": None,
            "recall": None,
            "f1": None,
            "map50": None,
            "map50_95": None,
            "present_in_metrics": False,
        }
        for index, class_name in enumerate(class_names)
    ]

    ap_class_index = [int(item) for item in list(getattr(box, "ap_class_index", []) or [])]
    p_values = list(getattr(box, "p", []) or [])
    r_values = list(getattr(box, "r", []) or [])
    f1_values = list(getattr(box, "f1", []) or [])
    ap50_values = list(getattr(box, "ap50", []) or [])
    ap_values = list(getattr(box, "ap", []) or [])

    for metric_index, class_index in enumerate(ap_class_index):
        if class_index < 0 or class_index >= len(entries):
            continue

        entry = entries[class_index]
        entry.update(
            {
                "precision": safe_float(p_values[metric_index] if metric_index < len(p_values) else None),
                "recall": safe_float(r_values[metric_index] if metric_index < len(r_values) else None),
                "f1": safe_float(f1_values[metric_index] if metric_index < len(f1_values) else None),
                "map50": safe_float(ap50_values[metric_index] if metric_index < len(ap50_values) else None),
                "map50_95": safe_float(ap_values[metric_index] if metric_index < len(ap_values) else None),
                "present_in_metrics": True,
            }
        )

    return entries


def _normalize_label(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _find_no_helmet_metrics(per_class_metrics: list[dict[str, Any]]) -> dict[str, Any] | None:
    for item in per_class_metrics:
        if _normalize_label(item["class_name"]) in NO_HELMET_LABEL_ALIASES:
            return item
    return None


def _collect_confusion_matrix_paths(split_output_dir: Path) -> list[str]:
    artifacts = []
    for filename in ("confusion_matrix.png", "confusion_matrix_normalized.png"):
        candidate = split_output_dir / filename
        if candidate.exists():
            artifacts.append(to_relative(candidate))
    return artifacts


def _serialize_split_metrics(
    *,
    split_name: str,
    metrics: Any,
    dataset_summary: dict[str, Any],
    split_output_dir: Path,
) -> dict[str, Any]:
    class_names = _extract_class_names(metrics, dataset_summary)
    per_class_metrics = _extract_per_class_metrics(metrics, class_names)
    no_helmet_metrics = _find_no_helmet_metrics(per_class_metrics)
    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)

    payload = {
        "split": split_name,
        "generated_at": utc_timestamp(),
        "output_directory": to_relative(split_output_dir),
        "metrics": {
            "precision": safe_float(results_dict.get("metrics/precision(B)") or getattr(box, "mp", None)),
            "recall": safe_float(results_dict.get("metrics/recall(B)") or getattr(box, "mr", None)),
            "f1": _macro_f1(metrics),
            "map50": safe_float(results_dict.get("metrics/mAP50(B)") or getattr(box, "map50", None)),
            "map50_95": safe_float(results_dict.get("metrics/mAP50-95(B)") or getattr(box, "map", None)),
            "per_class": per_class_metrics,
            "highlighted_no_helmet": {
                "class_name": no_helmet_metrics["class_name"] if no_helmet_metrics else None,
                "precision": no_helmet_metrics["precision"] if no_helmet_metrics else None,
                "recall": no_helmet_metrics["recall"] if no_helmet_metrics else None,
                "f1": no_helmet_metrics["f1"] if no_helmet_metrics else None,
                "map50": no_helmet_metrics["map50"] if no_helmet_metrics else None,
                "map50_95": no_helmet_metrics["map50_95"] if no_helmet_metrics else None,
            },
        },
        "artifacts": {
            "confusion_matrices": _collect_confusion_matrix_paths(split_output_dir),
        },
    }
    return payload


def _render_per_class_table(per_class_metrics: list[dict[str, Any]]) -> list[str]:
    lines = [
        "| Class | Precision | Recall | F1 | mAP@50 | mAP@50-95 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for item in per_class_metrics:
        lines.append(
            "| "
            f"{item['class_name']} | "
            f"{item['precision'] if item['precision'] is not None else 'n/a'} | "
            f"{item['recall'] if item['recall'] is not None else 'n/a'} | "
            f"{item['f1'] if item['f1'] is not None else 'n/a'} | "
            f"{item['map50'] if item['map50'] is not None else 'n/a'} | "
            f"{item['map50_95'] if item['map50_95'] is not None else 'n/a'} |"
        )
    return lines


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Helmet Model Evaluation Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Model: `{summary['model_path']}`",
        f"- Dataset: `{summary['dataset']['dataset_name']}`",
        f"- Output directory: `{summary['artifacts']['run_directory']}`",
        "",
        "## Evaluation Configuration",
        "",
        f"- Requested splits: {', '.join(summary['evaluation']['requested_splits'])}",
        f"- Image size: {summary['evaluation']['imgsz']}",
        f"- Confidence threshold: {summary['evaluation']['conf']}",
        f"- IoU threshold: {summary['evaluation']['iou']}",
        "",
        "## Dataset Snapshot",
        "",
        f"- Train images: {summary['dataset']['splits']['train']['image_count']}",
        f"- Validation images: {summary['dataset']['splits']['val']['image_count']}",
        f"- Test images: {summary['dataset']['splits']['test']['image_count']}",
        f"- Classes: {', '.join(summary['dataset']['class_names'])}",
        "",
        "## Executive Summary",
        "",
    ]

    if summary["evaluation"]["skipped_splits"]:
        skipped = ", ".join(
            f"{item['split']} ({item['reason']})" for item in summary["evaluation"]["skipped_splits"]
        )
        lines.append(f"- Skipped splits: {skipped}")
    else:
        lines.append("- All requested splits were evaluated successfully.")

    for split_name, split_payload in summary["evaluation"]["splits"].items():
        metrics = split_payload["metrics"]
        no_helmet = metrics["highlighted_no_helmet"]
        lines.append(
            f"- {split_name.title()}: precision={metrics['precision']}, recall={metrics['recall']}, "
            f"F1={metrics['f1']}, mAP@50={metrics['map50']}, mAP@50-95={metrics['map50_95']}, "
            f"no_helmet_recall={no_helmet['recall'] if no_helmet['recall'] is not None else 'n/a'}"
        )

    for split_name, split_payload in summary["evaluation"]["splits"].items():
        metrics = split_payload["metrics"]
        no_helmet = metrics["highlighted_no_helmet"]
        lines.extend(
            [
                "",
                f"## {split_name.title()} Split",
                "",
                f"- Precision: {metrics['precision']}",
                f"- Recall: {metrics['recall']}",
                f"- F1: {metrics['f1']}",
                f"- mAP@50: {metrics['map50']}",
                f"- mAP@50-95: {metrics['map50_95']}",
                f"- No-helmet class: {no_helmet['class_name'] or 'not found'}",
                f"- No-helmet recall: {no_helmet['recall'] if no_helmet['recall'] is not None else 'n/a'}",
                "",
                "### Per-Class Metrics",
                "",
            ]
        )
        lines.extend(_render_per_class_table(metrics["per_class"]))

        lines.extend(
            [
                "",
                "### Saved Artifacts",
                "",
            ]
        )
        confusion_matrices = split_payload["artifacts"]["confusion_matrices"]
        if confusion_matrices:
            lines.extend(f"- `{artifact}`" for artifact in confusion_matrices)
        else:
            lines.append("- No confusion matrix artifacts were found.")

    return "\n".join(lines) + "\n"


def evaluate_model(
    *,
    model_path: Path,
    data_path: Path,
    requested_splits: list[str],
    imgsz: int,
    conf: float,
    iou: float,
) -> dict[str, Any]:
    output_dir = _default_output_dir(model_path, data_path)
    dataset_summary = inspect_dataset(data_path)
    model = YOLO(str(model_path))

    evaluation_summaries: dict[str, Any] = {}
    skipped_splits: list[dict[str, str]] = []

    for split_name in requested_splits:
        if not path_exists(data_path, split_name):
            skipped_splits.append({"split": split_name, "reason": "split path missing from dataset"})
            continue

        split_output_dir = ensure_directory(output_dir / split_name)
        metrics = model.val(
            data=str(data_path),
            split=split_name,
            imgsz=imgsz,
            conf=conf,
            iou=iou,
            plots=True,
            project=str(output_dir),
            name=split_name,
            exist_ok=True,
            verbose=False,
        )
        evaluation_summaries[split_name] = _serialize_split_metrics(
            split_name=split_name,
            metrics=metrics,
            dataset_summary=dataset_summary,
            split_output_dir=split_output_dir,
        )

    summary = {
        "generated_at": utc_timestamp(),
        "run_name": output_dir.name,
        "target": {
            "key": "helmet",
            "display_name": "Helmet Detection",
        },
        "model_path": to_relative(model_path),
        "data_path": to_relative(data_path),
        "dataset": dataset_summary,
        "evaluation": {
            "imgsz": imgsz,
            "conf": conf,
            "iou": iou,
            "requested_splits": requested_splits,
            "completed_splits": list(evaluation_summaries.keys()),
            "skipped_splits": skipped_splits,
            "splits": evaluation_summaries,
        },
        "artifacts": {
            "run_directory": to_relative(output_dir),
            "evaluation_summary_json": to_relative(output_dir / "evaluation_summary.json"),
            "evaluation_summary_md": to_relative(output_dir / "evaluation_summary.md"),
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

    requested_splits = _parse_requested_splits(args.split)
    summary = evaluate_model(
        model_path=model_path.resolve(),
        data_path=data_path.resolve(),
        requested_splits=requested_splits,
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
    )

    print(f"Completed helmet evaluation: {summary['run_name']}")
    for split_name, split_payload in summary["evaluation"]["splits"].items():
        metrics = split_payload["metrics"]
        no_helmet_recall = metrics["highlighted_no_helmet"]["recall"]
        print(
            f"{split_name.title()} | "
            f"precision={metrics['precision']} recall={metrics['recall']} f1={metrics['f1']} "
            f"mAP50={metrics['map50']} mAP50-95={metrics['map50_95']} "
            f"no_helmet_recall={no_helmet_recall if no_helmet_recall is not None else 'n/a'}"
        )


if __name__ == "__main__":
    main()

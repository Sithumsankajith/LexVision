#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_YAML = (
    BASE_DIR
    / "datasets"
    / "NumberPlate"
    / "Automatic Number Plate Recognition.v9i.yolov8"
    / "data.yaml"
)
DEFAULT_OUTPUT_DIR = BASE_DIR / "evaluation_results" / "anpr" / "trained_model"
ARTIFACT_NAMES = (
    "confusion_matrix.png",
    "confusion_matrix_normalized.png",
    "PR_curve.png",
    "F1_curve.png",
    "P_curve.png",
    "R_curve.png",
    "results.csv",
)
VAL_BATCH_PATTERNS = ("val_batch",)


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_relative(path: Path) -> str:
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


def resolve_path(value: str, *, default_parent: Path = BASE_DIR) -> Path:
    candidate = Path(value).expanduser()
    candidates = [candidate]
    if not candidate.is_absolute():
        candidates.extend([default_parent / value, BASE_DIR / value, BASE_DIR / "models" / value])
    for item in candidates:
        if item.exists():
            return item.resolve()
    return candidate


def sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "anpr_eval"


def f1_score(precision: float | None, recall: float | None) -> float | None:
    if precision is None or recall is None:
        return None
    return round(2 * precision * recall / (precision + recall), 4) if precision + recall > 0 else 0.0


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def extract_per_class_metrics(metrics: Any, class_names: list[str]) -> list[dict[str, Any]]:
    box = getattr(metrics, "box", None)
    if box is None:
        return []

    def _as_list(value: Any) -> list[Any]:
        if value is None:
            return []
        if hasattr(value, "tolist"):
            return value.tolist()
        return list(value)

    ap_class_index = [int(item) for item in _as_list(getattr(box, "ap_class_index", None))]
    p_values = _as_list(getattr(box, "p", None))
    r_values = _as_list(getattr(box, "r", None))
    f1_values = _as_list(getattr(box, "f1", None))
    ap50_values = _as_list(getattr(box, "ap50", None))
    ap_values = _as_list(getattr(box, "ap", None))
    maps = _as_list(getattr(box, "maps", None))

    entries = []
    for class_index, class_name in enumerate(class_names):
        entry = {
            "class_index": class_index,
            "class_name": class_name,
            "precision": None,
            "recall": None,
            "f1": None,
            "map50": None,
            "map50_95": safe_float(maps[class_index] if class_index < len(maps) else None),
            "present_in_metrics": False,
        }
        if class_index in ap_class_index:
            metric_index = ap_class_index.index(class_index)
            entry.update(
                {
                    "precision": safe_float(p_values[metric_index] if metric_index < len(p_values) else None),
                    "recall": safe_float(r_values[metric_index] if metric_index < len(r_values) else None),
                    "f1": safe_float(f1_values[metric_index] if metric_index < len(f1_values) else None),
                    "map50": safe_float(ap50_values[metric_index] if metric_index < len(ap50_values) else None),
                    "map50_95": safe_float(ap_values[metric_index] if metric_index < len(ap_values) else entry["map50_95"]),
                    "present_in_metrics": True,
                }
            )
        entries.append(entry)
    return entries


def extract_metrics(metrics: Any, class_names: list[str]) -> dict[str, Any]:
    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)
    speed = getattr(metrics, "speed", {}) or {}
    precision = safe_float(results_dict.get("metrics/precision(B)") or getattr(box, "mp", None))
    recall = safe_float(results_dict.get("metrics/recall(B)") or getattr(box, "mr", None))
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1_score(precision, recall),
        "map50": safe_float(results_dict.get("metrics/mAP50(B)") or getattr(box, "map50", None)),
        "map50_95": safe_float(results_dict.get("metrics/mAP50-95(B)") or getattr(box, "map", None)),
        "fitness": safe_float(results_dict.get("fitness") or getattr(metrics, "fitness", None)),
        "speed_ms_per_image": {
            "preprocess": safe_float(speed.get("preprocess")),
            "inference": safe_float(speed.get("inference")),
            "postprocess": safe_float(speed.get("postprocess")),
        },
        "per_class": extract_per_class_metrics(metrics, class_names),
    }


def collect_artifacts(source_dir: Path, destination_dir: Path) -> list[str]:
    copied: list[str] = []
    destination_dir.mkdir(parents=True, exist_ok=True)
    for filename in ARTIFACT_NAMES:
        source = source_dir / filename
        if source.exists():
            destination = destination_dir / filename
            shutil.copy2(source, destination)
            copied.append(to_relative(destination))
    for source in source_dir.iterdir() if source_dir.exists() else []:
        if source.is_file() and any(pattern in source.name for pattern in VAL_BATCH_PATTERNS):
            destination = destination_dir / source.name
            shutil.copy2(source, destination)
            copied.append(to_relative(destination))
    return copied


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# ANPR Model Evaluation Summary",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Model: `{summary['model_path']}`",
        f"- Dataset: `{summary['data_yaml']}`",
        f"- Output directory: `{summary['output_dir']}`",
        "",
        "## Metrics",
        "",
        "| Split | Precision | Recall | F1 | mAP50 | mAP50-95 | Speed |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for split, payload in summary["splits"].items():
        metrics = payload["metrics"]
        speed = metrics["speed_ms_per_image"]
        speed_text = (
            f"{speed['preprocess']}/{speed['inference']}/{speed['postprocess']} ms "
            "(pre/infer/post)"
        )
        lines.append(
            "| "
            f"{split} | {metrics['precision']} | {metrics['recall']} | {metrics['f1']} | "
            f"{metrics['map50']} | {metrics['map50_95']} | {speed_text} |"
        )
    lines.extend(["", "## Per-Class Metrics", ""])
    for split, payload in summary["splits"].items():
        lines.extend(
            [
                f"### {split.title()}",
                "",
                "| Class | Precision | Recall | F1 | mAP50 | mAP50-95 |",
                "| --- | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for item in payload["metrics"]["per_class"]:
            lines.append(
                "| "
                f"{item['class_name']} | {item['precision']} | {item['recall']} | {item['f1']} | "
                f"{item['map50']} | {item['map50_95']} |"
            )
        lines.append("")

    lines.extend(
        [
            "## Artifacts",
            "",
        ]
    )
    for split, payload in summary["splits"].items():
        lines.append(f"- {split}:")
        if payload["artifacts"]:
            lines.extend(f"  - `{artifact}`" for artifact in payload["artifacts"])
        else:
            lines.append("  - No plot artifacts were produced by Ultralytics for this split.")
    lines.extend(
        [
            "",
            "## Enforcement Note",
            "",
            "ANPR assists officer review only. Officers must verify the plate number from the evidence before issuing a ticket.",
        ]
    )
    return "\n".join(lines) + "\n"


def render_training_report(summary: dict[str, Any]) -> str:
    lines = [
        "# ANPR Model Training Report",
        "",
        "This report is generated from actual YOLO validation outputs. Missing values indicate that a model has not been trained or evaluated yet.",
        "",
        f"- Model: `{summary['model_path']}`",
        f"- Dataset: `{summary['data_yaml']}`",
        f"- Image size: {summary['imgsz']}",
        "",
        "## Evaluation Summary",
        "",
        "| Split | Precision | Recall | F1 | mAP50 | mAP50-95 |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for split, payload in summary["splits"].items():
        metrics = payload["metrics"]
        lines.append(
            f"| {split} | {metrics['precision']} | {metrics['recall']} | {metrics['f1']} | {metrics['map50']} | {metrics['map50_95']} |"
        )
    lines.extend(
        [
            "",
            "## Limitations",
            "",
            "- Detector metrics measure plate localization only; they do not measure OCR exact-match accuracy.",
            "- Sri Lankan number plate OCR must be evaluated separately with plate-string ground truth.",
            "- Generic COCO YOLO baselines are not specialized for Sri Lankan number plates.",
        ]
    )
    return "\n".join(lines) + "\n"


def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    from ultralytics import YOLO

    model_path = resolve_path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model weights not found: {model_path}")
    data_yaml = resolve_path(args.data)
    if data_yaml.is_dir():
        data_yaml = data_yaml / "data.yaml"
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml}")

    output_root = Path(args.output_dir).expanduser()
    if not output_root.is_absolute():
        output_root = (Path.cwd() / output_root).resolve()
    run_name = args.name or sanitize_name(f"{model_path.stem}_{data_yaml.parent.name}")
    run_dir = output_root / run_name
    run_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(model_path))
    class_names = []
    names = getattr(model, "names", {}) or {}
    if isinstance(names, dict):
        class_names = [str(names[key]) for key in sorted(names)]
    elif isinstance(names, list):
        class_names = [str(name) for name in names]
    if args.class_name:
        class_names = [args.class_name]

    splits: dict[str, Any] = {}
    for split in [item.strip() for item in args.split.split(",") if item.strip()]:
        metrics = model.val(
            data=str(data_yaml),
            split=split,
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            plots=True,
            project=str(run_dir / "ultralytics"),
            name=split,
            exist_ok=True,
            device=args.device or None,
            verbose=False,
        )
        save_dir = Path(getattr(metrics, "save_dir", run_dir / "ultralytics" / split))
        effective_names = class_names
        metric_names = getattr(metrics, "names", {}) or {}
        if isinstance(metric_names, dict):
            effective_names = [str(metric_names[key]) for key in sorted(metric_names)]
        if args.class_name:
            effective_names = [args.class_name]
        artifact_dir = run_dir / split
        splits[split] = {
            "source_output_dir": to_relative(save_dir),
            "artifact_dir": to_relative(artifact_dir),
            "metrics": extract_metrics(metrics, effective_names),
            "artifacts": collect_artifacts(save_dir, artifact_dir),
        }

    summary = {
        "generated_at": utc_timestamp(),
        "model_path": to_relative(model_path),
        "data_yaml": to_relative(data_yaml),
        "imgsz": args.imgsz,
        "conf": args.conf,
        "iou": args.iou,
        "output_dir": to_relative(run_dir),
        "splits": splits,
    }
    write_json(run_dir / "evaluation_summary.json", summary)
    write_text(run_dir / "evaluation_summary.md", render_markdown(summary))
    write_text(run_dir / "ANPR_MODEL_TRAINING_REPORT.md", render_training_report(summary))
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a YOLOv8 ANPR plate detector.")
    parser.add_argument("--model", required=True, help="Path to model weights.")
    parser.add_argument("--data", default=str(DEFAULT_DATA_YAML), help="Path to ANPR data.yaml.")
    parser.add_argument("--split", default="val,test", help="Comma-separated splits to evaluate.")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--device", default="")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--name", default=None)
    parser.add_argument("--class-name", default="License_Plate", help="Class name to use for single-class ANPR reports.")
    return parser.parse_args()


def main() -> None:
    summary = evaluate(parse_args())
    print(f"Wrote {Path(BASE_DIR / summary['output_dir']) if not Path(summary['output_dir']).is_absolute() else summary['output_dir']}")
    for split, payload in summary["splits"].items():
        metrics = payload["metrics"]
        print(
            f"{split}: precision={metrics['precision']} recall={metrics['recall']} "
            f"f1={metrics['f1']} map50={metrics['map50']} map50-95={metrics['map50_95']}"
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ANPR evaluation failed: {exc}", file=sys.stderr)
        raise

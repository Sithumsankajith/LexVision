#!/usr/bin/env python3
"""
YOLOv8 Helmet Model Evaluation Script
=======================================
Evaluates a trained YOLOv8 helmet detection model on the test split,
generates comprehensive metrics, and creates report-ready outputs.

Usage:
    python evaluate_helmetvd1.py --model PATH_TO_BEST_PT [--data PATH_TO_DATA_YAML]
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_YAML = BASE_DIR / "datasets" / "Helmet" / "helmetvd1_yolov8" / "data.yaml"
DEFAULT_OUTPUT_DIR = BASE_DIR / "evaluation_results" / "helmetvd1"


def safe_float(val: Any, digits: int = 4) -> float | None:
    if val is None:
        return None
    try:
        return round(float(val), digits)
    except (TypeError, ValueError):
        return None


def extract_full_metrics(metrics: Any, class_names: list[str]) -> dict[str, Any]:
    """Extract comprehensive metrics from Ultralytics validation results."""
    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)
    speed = getattr(metrics, "speed", {}) or {}

    # Overall metrics
    precision = safe_float(results_dict.get("metrics/precision(B)"))
    recall = safe_float(results_dict.get("metrics/recall(B)"))
    map50 = safe_float(results_dict.get("metrics/mAP50(B)"))
    map50_95 = safe_float(results_dict.get("metrics/mAP50-95(B)"))

    if precision is None and box is not None:
        try:
            mr = list(box.mean_results()) if callable(getattr(box, "mean_results", None)) else list(box.mean_results)
            precision = safe_float(mr[0]) if len(mr) > 0 else None
            recall = safe_float(mr[1]) if len(mr) > 1 else None
        except (TypeError, AttributeError):
            pass

    if map50 is None and box is not None:
        map50 = safe_float(getattr(box, "map50", None))
    if map50_95 is None and box is not None:
        map50_95 = safe_float(getattr(box, "map", None))

    # F1 score
    f1 = None
    if precision is not None and recall is not None:
        p, r = float(precision), float(recall)
        f1 = round(2 * p * r / (p + r), 4) if (p + r) > 0 else 0.0

    # Per-class metrics
    per_class = []
    per_class_map = getattr(box, "maps", None) if box is not None else None
    if per_class_map is not None:
        for i, v in enumerate(per_class_map):
            label = class_names[i] if i < len(class_names) else f"class_{i}"
            per_class.append({
                "class_name": label,
                "map50_95": safe_float(v),
            })

    return {
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "map50": map50,
        "map50_95": map50_95,
        "per_class": per_class,
        "speed_ms": {
            "preprocess": safe_float(speed.get("preprocess"), 2),
            "inference": safe_float(speed.get("inference"), 2),
            "postprocess": safe_float(speed.get("postprocess"), 2),
        },
        "raw_results_dict": {k: safe_float(v) for k, v in results_dict.items()} if results_dict else {},
    }


def evaluate_model(args: argparse.Namespace) -> dict[str, Any]:
    """Run full evaluation pipeline."""
    from ultralytics import YOLO

    model_path = Path(args.model).resolve()
    data_yaml = Path(args.data).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml}")

    output_dir.mkdir(parents=True, exist_ok=True)
    class_names = ["helmet", "no_helmet"]

    print(f"\n{'='*60}")
    print(f"  Helmet Model Evaluation")
    print(f"{'='*60}")
    print(f"  Model:   {model_path}")
    print(f"  Dataset: {data_yaml}")
    print(f"  Output:  {output_dir}")
    print(f"{'='*60}\n")

    model = YOLO(str(model_path))

    all_metrics = {}

    # Evaluate on each requested split
    for split in args.splits.split(","):
        split = split.strip()
        if not split:
            continue

        print(f"\n[EVAL] Evaluating on '{split}' split...")
        split_output = output_dir / f"{split}_eval"
        split_output.mkdir(parents=True, exist_ok=True)

        metrics = model.val(
            data=str(data_yaml),
            split=split,
            imgsz=args.imgsz,
            device=args.device or None,
            conf=args.conf,
            iou=args.iou,
            plots=True,
            project=str(output_dir),
            name=f"{split}_eval",
            exist_ok=True,
            verbose=False,
        )

        extracted = extract_full_metrics(metrics, class_names)
        all_metrics[split] = extracted

        # Copy plots to output directory
        eval_dir = output_dir / f"{split}_eval"
        if eval_dir.exists():
            for plot_file in eval_dir.glob("*.png"):
                dest = output_dir / f"{split}_{plot_file.name}"
                shutil.copy2(plot_file, dest)
            for csv_file in eval_dir.glob("*.csv"):
                dest = output_dir / f"{split}_{csv_file.name}"
                shutil.copy2(csv_file, dest)

        print(f"  Precision:  {extracted['precision']}")
        print(f"  Recall:     {extracted['recall']}")
        print(f"  F1-score:   {extracted['f1_score']}")
        print(f"  mAP@50:     {extracted['map50']}")
        print(f"  mAP@50-95:  {extracted['map50_95']}")

    # Build evaluation summary
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_path": str(model_path),
        "model_name": model_path.stem,
        "dataset": str(data_yaml),
        "class_names": class_names,
        "evaluation_config": {
            "imgsz": args.imgsz,
            "conf_threshold": args.conf,
            "iou_threshold": args.iou,
        },
        "metrics": all_metrics,
    }

    # Save JSON
    json_path = output_dir / "evaluation_summary.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[EVAL] JSON summary saved: {json_path}")

    # Save CSV
    csv_path = output_dir / "results.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["split", "precision", "recall", "f1_score", "mAP50", "mAP50-95",
                         "inference_ms", "preprocess_ms", "postprocess_ms"])
        for split_name, m in all_metrics.items():
            writer.writerow([
                split_name,
                m["precision"], m["recall"], m["f1_score"],
                m["map50"], m["map50_95"],
                m["speed_ms"]["inference"],
                m["speed_ms"]["preprocess"],
                m["speed_ms"]["postprocess"],
            ])
    print(f"[EVAL] CSV results saved: {csv_path}")

    # Generate Markdown report
    md_content = generate_evaluation_md(summary)
    md_path = output_dir / "evaluation_summary.md"
    md_path.write_text(md_content, encoding="utf-8")
    print(f"[EVAL] Markdown report saved: {md_path}")

    return summary


def generate_evaluation_md(summary: dict[str, Any]) -> str:
    """Generate a Markdown evaluation report."""
    lines = [
        "# Helmet Detection Model — Evaluation Summary",
        "",
        f"**Generated:** {summary['generated_at']}",
        f"**Model:** `{summary['model_name']}`",
        f"**Dataset:** `{summary['dataset']}`",
        "",
        "## Evaluation Configuration",
        "",
        f"- Image size: {summary['evaluation_config']['imgsz']}",
        f"- Confidence threshold: {summary['evaluation_config']['conf_threshold']}",
        f"- IoU threshold: {summary['evaluation_config']['iou_threshold']}",
        f"- Classes: {', '.join(summary['class_names'])}",
        "",
    ]

    for split_name, m in summary["metrics"].items():
        lines.extend([
            f"## {split_name.title()} Split Metrics",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Precision | {m['precision']} |",
            f"| Recall | {m['recall']} |",
            f"| F1-Score | {m['f1_score']} |",
            f"| mAP@50 | {m['map50']} |",
            f"| mAP@50-95 | {m['map50_95']} |",
            f"| Inference (ms) | {m['speed_ms']['inference']} |",
            "",
        ])

        if m.get("per_class"):
            lines.extend([
                f"### Per-Class mAP@50-95 ({split_name})",
                "",
                "| Class | mAP@50-95 |",
                "|---|---|",
            ])
            for pc in m["per_class"]:
                lines.append(f"| {pc['class_name']} | {pc['map50_95']} |")
            lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a trained YOLOv8 helmet detection model.")
    parser.add_argument("--model", type=str, required=True,
                        help="Path to trained model weights (.pt)")
    parser.add_argument("--data", type=str, default=str(DEFAULT_DATA_YAML),
                        help="Path to data.yaml")
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_OUTPUT_DIR),
                        help="Output directory for evaluation results")
    parser.add_argument("--splits", type=str, default="val,test",
                        help="Comma-separated splits to evaluate")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Image size for evaluation")
    parser.add_argument("--conf", type=float, default=0.25,
                        help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.7,
                        help="IoU threshold")
    parser.add_argument("--device", type=str, default="",
                        help="Device (cpu, cuda:0, etc)")
    args = parser.parse_args()

    summary = evaluate_model(args)
    print(f"\n✅ Evaluation complete. Results saved to: {args.output_dir}")


if __name__ == "__main__":
    main()

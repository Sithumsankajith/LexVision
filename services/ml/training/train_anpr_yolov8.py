#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
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
DEFAULT_PROJECT = BASE_DIR / "runs" / "anpr_training"
MODELS_DIR = BASE_DIR / "models"


def resolve_existing_path(value: str) -> Path:
    candidate = Path(value).expanduser()
    candidates = [candidate]
    if not candidate.is_absolute():
        candidates.extend([BASE_DIR / value, MODELS_DIR / value])
    for item in candidates:
        if item.exists():
            return item.resolve()
    return candidate


def extract_metrics(metrics: Any) -> dict[str, Any]:
    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)
    speed = getattr(metrics, "speed", {}) or {}

    precision = results_dict.get("metrics/precision(B)") or getattr(box, "mp", None)
    recall = results_dict.get("metrics/recall(B)") or getattr(box, "mr", None)
    map50 = results_dict.get("metrics/mAP50(B)") or getattr(box, "map50", None)
    map50_95 = results_dict.get("metrics/mAP50-95(B)") or getattr(box, "map", None)
    f1 = None
    if precision is not None and recall is not None:
        p, r = float(precision), float(recall)
        f1 = 2 * p * r / (p + r) if p + r > 0 else 0.0

    names = getattr(metrics, "names", {}) or {}
    class_names = [names[key] for key in sorted(names)] if isinstance(names, dict) else list(names)
    per_class = []
    maps = getattr(box, "maps", None) if box is not None else None
    if maps is not None:
        for index, value in enumerate(list(maps)):
            per_class.append(
                {
                    "class_index": index,
                    "class_name": class_names[index] if index < len(class_names) else f"class_{index}",
                    "map50_95": round(float(value), 4),
                }
            )

    return {
        "precision": round(float(precision), 4) if precision is not None else None,
        "recall": round(float(recall), 4) if recall is not None else None,
        "f1": round(float(f1), 4) if f1 is not None else None,
        "map50": round(float(map50), 4) if map50 is not None else None,
        "map50_95": round(float(map50_95), 4) if map50_95 is not None else None,
        "speed_ms_per_image": {
            "preprocess": round(float(speed.get("preprocess", 0.0)), 4),
            "inference": round(float(speed.get("inference", 0.0)), 4),
            "postprocess": round(float(speed.get("postprocess", 0.0)), 4),
        },
        "per_class": per_class,
    }


def train_model(args: argparse.Namespace) -> dict[str, Any]:
    from ultralytics import YOLO

    data_yaml = resolve_existing_path(args.data)
    if data_yaml.is_dir():
        data_yaml = data_yaml / "data.yaml"
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml}")

    model_path = resolve_existing_path(args.model)
    run_name = args.name or f"anpr_{Path(args.model).stem}"
    project_dir = Path(args.project).expanduser()
    if not project_dir.is_absolute():
        project_dir = (BASE_DIR / project_dir).resolve()

    print("ANPR YOLOv8 training")
    print(f"  model:   {model_path}")
    print(f"  data:    {data_yaml}")
    print(f"  imgsz:   {args.imgsz}")
    print(f"  epochs:  {args.epochs}")
    print(f"  batch:   {args.batch}")
    print(f"  project: {project_dir}")
    print(f"  name:    {run_name}")

    model = YOLO(str(model_path))
    model.train(
        data=str(data_yaml),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        patience=args.patience,
        seed=args.seed,
        workers=args.workers,
        project=str(project_dir),
        name=run_name,
        plots=True,
        save=True,
        pretrained=True,
        exist_ok=args.exist_ok,
        device=args.device or None,
        deterministic=True,
        hsv_h=0.015,
        hsv_s=0.55,
        hsv_v=0.22,
        degrees=3.0,
        translate=0.08,
        scale=0.25,
        shear=0.0,
        perspective=0.0008,
        flipud=0.0,
        fliplr=0.5,
        mosaic=0.6,
        mixup=0.04,
        copy_paste=0.0,
    )

    run_dir = project_dir / run_name
    best_weights = run_dir / "weights" / "best.pt"
    last_weights = run_dir / "weights" / "last.pt"
    selected_weights = best_weights if best_weights.exists() else last_weights
    if not selected_weights.exists():
        raise FileNotFoundError(f"No trained weights found under {run_dir / 'weights'}")

    trained_model = YOLO(str(selected_weights))
    evaluations: dict[str, Any] = {}
    for split in ("val", "test"):
        metrics = trained_model.val(
            data=str(data_yaml),
            split=split,
            imgsz=args.imgsz,
            plots=True,
            project=str(run_dir / "evaluations"),
            name=split,
            exist_ok=True,
            device=args.device or None,
            verbose=False,
        )
        evaluations[split] = extract_metrics(metrics)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
        "model": str(model_path),
        "dataset": str(data_yaml),
        "run_name": run_name,
        "run_directory": str(run_dir),
        "best_weights": str(selected_weights),
        "training": {
            "imgsz": args.imgsz,
            "epochs": args.epochs,
            "batch": args.batch,
            "patience": args.patience,
            "seed": args.seed,
            "workers": args.workers,
            "device": args.device or "auto",
        },
        "evaluations": evaluations,
    }

    reports_dir = run_dir / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    summary_path = reports_dir / "training_summary.json"
    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")

    if args.copy_best:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(selected_weights, MODELS_DIR / "anpr_best.pt")
        summary["copied_to"] = str(MODELS_DIR / "anpr_best.pt")

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a YOLOv8 ANPR plate detector.")
    parser.add_argument("--model", default="yolov8n.pt", help="Base YOLOv8 weights, for example yolov8n.pt or yolov8s.pt.")
    parser.add_argument("--data", default=str(DEFAULT_DATA_YAML), help="Path to selected ANPR data.yaml.")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--name", default="anpr_yolov8n")
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--project", default=str(DEFAULT_PROJECT))
    parser.add_argument("--device", default="")
    parser.add_argument("--exist-ok", action="store_true")
    parser.add_argument("--copy-best", action="store_true", help="Copy the selected best weights to services/ml/models/anpr_best.pt.")
    return parser.parse_args()


def main() -> None:
    summary = train_model(parse_args())
    print(f"Completed ANPR training run: {summary['run_name']}")
    print(f"Best weights: {summary['best_weights']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ANPR training failed: {exc}", file=sys.stderr)
        raise

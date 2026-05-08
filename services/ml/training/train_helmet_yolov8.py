#!/usr/bin/env python3
"""
YOLOv8 Helmet Detection Training Script
=========================================
Fine-tunes YOLOv8 models on the helmetvd1_yolov8 converted dataset.

Supports both YOLOv8n (nano) and YOLOv8s (small) architectures.
Compatible with the existing training/pipeline.py infrastructure.

Usage:
    python train_helmet_yolov8.py --model yolov8n.pt --epochs 30 --batch 8
    python train_helmet_yolov8.py --model yolov8s.pt --epochs 50 --batch 4
"""
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
DEFAULT_DATA_YAML = BASE_DIR / "datasets" / "Helmet" / "helmetvd1_yolov8" / "data.yaml"
DEFAULT_PROJECT = BASE_DIR / "runs" / "helmet_training"
MODELS_DIR = BASE_DIR / "models"


def train_model(args: argparse.Namespace) -> dict[str, Any]:
    """Train a YOLOv8 model on the helmet dataset."""
    from ultralytics import YOLO

    model_name = Path(args.model).stem
    run_name = args.name or f"helmetvd1_{model_name}"
    project_dir = Path(args.project).resolve()
    data_yaml = Path(args.data).resolve()

    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml}")

    print(f"\n{'='*60}")
    print(f"  YOLOv8 Helmet Detection Training")
    print(f"{'='*60}")
    print(f"  Model:    {args.model}")
    print(f"  Dataset:  {data_yaml}")
    print(f"  Epochs:   {args.epochs}")
    print(f"  ImgSize:  {args.imgsz}")
    print(f"  Batch:    {args.batch}")
    print(f"  Patience: {args.patience}")
    print(f"  Seed:     {args.seed}")
    print(f"  Project:  {project_dir}")
    print(f"  Run:      {run_name}")
    print(f"{'='*60}\n")

    # Resolve model weights
    model_path = Path(args.model)
    if not model_path.exists():
        candidates = [
            BASE_DIR / args.model,
            MODELS_DIR / args.model,
        ]
        for candidate in candidates:
            if candidate.exists():
                model_path = candidate
                break

    # Load model
    model = YOLO(str(model_path))

    # Train
    train_results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        seed=args.seed,
        pretrained=True,
        save=True,
        plots=True,
        project=str(project_dir),
        name=run_name,
        exist_ok=True,
        device=args.device or None,
        workers=args.workers,
        deterministic=True,
        verbose=True,
        # Augmentation settings for traffic/helmet domain
        hsv_h=0.015,
        hsv_s=0.6,
        hsv_v=0.25,
        degrees=6.0,
        translate=0.1,
        scale=0.35,
        flipud=0.0,
        fliplr=0.5,
        mosaic=0.8,
        mixup=0.08,
    )

    # Find best weights
    run_dir = project_dir / run_name
    best_weights = run_dir / "weights" / "best.pt"
    last_weights = run_dir / "weights" / "last.pt"

    if not best_weights.exists() and last_weights.exists():
        best_weights = last_weights

    if not best_weights.exists():
        print("[ERROR] No trained weights found!")
        return {"status": "failed", "error": "No weights produced"}

    # Run validation on val split
    print(f"\n[EVAL] Running validation on val split...")
    val_model = YOLO(str(best_weights))
    val_metrics = val_model.val(
        data=str(data_yaml),
        split="val",
        imgsz=args.imgsz,
        device=args.device or None,
        plots=True,
        project=str(run_dir),
        name="val_eval",
        exist_ok=True,
        verbose=False,
    )

    # Run validation on test split
    print(f"[EVAL] Running validation on test split...")
    test_metrics = val_model.val(
        data=str(data_yaml),
        split="test",
        imgsz=args.imgsz,
        device=args.device or None,
        plots=True,
        project=str(run_dir),
        name="test_eval",
        exist_ok=True,
        verbose=False,
    )

    def extract_metrics(metrics: Any) -> dict[str, Any]:
        results_dict = getattr(metrics, "results_dict", {}) or {}
        box = getattr(metrics, "box", None)
        speed = getattr(metrics, "speed", {}) or {}

        precision = results_dict.get("metrics/precision(B)")
        recall = results_dict.get("metrics/recall(B)")
        map50 = results_dict.get("metrics/mAP50(B)")
        map50_95 = results_dict.get("metrics/mAP50-95(B)")

        if precision is None and box is not None:
            try:
                mr = list(box.mean_results()) if callable(getattr(box, "mean_results", None)) else list(box.mean_results)
                precision = mr[0] if len(mr) > 0 else None
                recall = mr[1] if len(mr) > 1 else None
            except (TypeError, AttributeError):
                pass

        if map50 is None and box is not None:
            map50 = getattr(box, "map50", None)
        if map50_95 is None and box is not None:
            map50_95 = getattr(box, "map", None)

        # Per-class metrics
        per_class = []
        per_class_map = getattr(box, "maps", None) if box is not None else None
        if per_class_map is not None:
            class_names = ["helmet", "no_helmet"]
            for i, v in enumerate(per_class_map):
                label = class_names[i] if i < len(class_names) else f"class_{i}"
                per_class.append({"class_name": label, "map50_95": round(float(v), 4) if v is not None else None})

        # Compute F1
        f1 = None
        if precision is not None and recall is not None:
            p, r = float(precision), float(recall)
            f1 = round(2 * p * r / (p + r), 4) if (p + r) > 0 else 0.0

        return {
            "precision": round(float(precision), 4) if precision is not None else None,
            "recall": round(float(recall), 4) if recall is not None else None,
            "f1_score": f1,
            "map50": round(float(map50), 4) if map50 is not None else None,
            "map50_95": round(float(map50_95), 4) if map50_95 is not None else None,
            "per_class": per_class,
            "speed_ms": {
                "preprocess": round(float(speed.get("preprocess", 0)), 2),
                "inference": round(float(speed.get("inference", 0)), 2),
                "postprocess": round(float(speed.get("postprocess", 0)), 2),
            },
        }

    val_result = extract_metrics(val_metrics)
    test_result = extract_metrics(test_metrics)

    # Summary
    training_summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
        "model": args.model,
        "model_architecture": model_name,
        "dataset": str(data_yaml),
        "run_name": run_name,
        "run_directory": str(run_dir),
        "best_weights": str(best_weights),
        "config": {
            "epochs": args.epochs,
            "imgsz": args.imgsz,
            "batch": args.batch,
            "patience": args.patience,
            "seed": args.seed,
            "device": args.device or "auto",
        },
        "val_metrics": val_result,
        "test_metrics": test_result,
    }

    # Save summary
    summary_path = run_dir / "training_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(training_summary, f, indent=2)
    print(f"\n[TRAIN] Training summary saved: {summary_path}")

    # Print results
    print(f"\n{'='*60}")
    print(f"  TRAINING COMPLETE: {run_name}")
    print(f"{'='*60}")
    print(f"  Best weights: {best_weights}")
    print(f"")
    print(f"  Validation Metrics:")
    print(f"    Precision:  {val_result['precision']}")
    print(f"    Recall:     {val_result['recall']}")
    print(f"    F1-score:   {val_result['f1_score']}")
    print(f"    mAP@50:     {val_result['map50']}")
    print(f"    mAP@50-95:  {val_result['map50_95']}")
    print(f"")
    print(f"  Test Metrics:")
    print(f"    Precision:  {test_result['precision']}")
    print(f"    Recall:     {test_result['recall']}")
    print(f"    F1-score:   {test_result['f1_score']}")
    print(f"    mAP@50:     {test_result['map50']}")
    print(f"    mAP@50-95:  {test_result['map50_95']}")
    print(f"{'='*60}")

    # Copy best model to models directory
    dest_model = MODELS_DIR / "helmet_best.pt"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_weights, dest_model)
    print(f"\n[MODEL] Best model copied to: {dest_model}")

    return training_summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train YOLOv8 helmet detection model on helmetvd1 dataset."
    )
    parser.add_argument("--model", type=str, default="yolov8n.pt",
                        help="Base model weights (yolov8n.pt or yolov8s.pt)")
    parser.add_argument("--data", type=str, default=str(DEFAULT_DATA_YAML),
                        help="Path to data.yaml for the YOLOv8 dataset")
    parser.add_argument("--epochs", type=int, default=30,
                        help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Training image size")
    parser.add_argument("--batch", type=int, default=8,
                        help="Batch size")
    parser.add_argument("--patience", type=int, default=10,
                        help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed")
    parser.add_argument("--device", type=str, default="",
                        help="Device (cpu, cuda:0, etc)")
    parser.add_argument("--workers", type=int, default=4,
                        help="Number of dataloader workers")
    parser.add_argument("--name", type=str, default=None,
                        help="Run name (default: helmetvd1_<model>)")
    parser.add_argument("--project", type=str, default=str(DEFAULT_PROJECT),
                        help="Project directory for saving runs")
    args = parser.parse_args()

    summary = train_model(args)

    if summary["status"] == "completed":
        print("\n✅ Training completed successfully!")
        sys.exit(0)
    else:
        print(f"\n❌ Training failed: {summary.get('error', 'unknown')}")
        sys.exit(1)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import importlib.metadata
import os
import platform
import random
from pathlib import Path
from typing import Any

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

import numpy as np
import torch
from ultralytics import YOLO

from augmentations import patch_ultralytics_albumentations
from common import (
    DEFAULT_RESULTS_DIR,
    MODELS_DIR,
    TrainingTarget,
    build_summary_payload,
    ensure_directory,
    extract_detection_metrics,
    inspect_dataset,
    path_exists,
    render_report_markdown,
    resolve_dataset_yaml,
    resolve_target,
    resolve_weights_path,
    safe_float,
    to_relative,
    utc_timestamp,
    write_json,
    write_text,
)


def _add_shared_arguments(
    parser: argparse.ArgumentParser,
    *,
    target: TrainingTarget | None = None,
    include_version: bool = True,
) -> argparse.ArgumentParser:
    if include_version:
        parser.add_argument("--version", type=str, help="Run version tag used in the output folder name.")
    parser.add_argument("--dataset", type=str, default=None, help="Path to a dataset directory or its data.yaml file.")
    parser.add_argument("--base-model", type=str, default=None, help="Base YOLO weights to fine-tune.")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs.")
    parser.add_argument(
        "--imgsz",
        type=int,
        default=target.default_imgsz if target else 640,
        choices=list(target.supported_imgsz) if target and target.supported_imgsz else None,
        help="Training/evaluation image size.",
    )
    parser.add_argument("--batch", type=int, default=-1, help="Batch size. Use -1 for Ultralytics auto-batch.")
    parser.add_argument("--device", type=str, default="", help="Device to use, for example `cpu` or `cuda:0`.")
    parser.add_argument("--workers", type=int, default=4, help="Number of dataloader workers.")
    parser.add_argument(
        "--patience",
        type=int,
        default=target.default_patience if target else 20,
        help="Early stopping patience.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Training seed.")
    parser.add_argument("--optimizer", type=str, default="auto", help="Optimizer to use, for example `auto`, `SGD`, or `AdamW`.")
    parser.add_argument("--lr0", type=float, default=0.01, help="Initial learning rate.")
    parser.add_argument("--lrf", type=float, default=0.01, help="Final learning-rate multiplier.")
    parser.add_argument("--weight-decay", type=float, default=0.0005, help="Weight decay.")
    parser.add_argument("--warmup-epochs", type=float, default=3.0, help="Warmup epochs.")
    parser.add_argument("--close-mosaic", type=int, default=10, help="Disable mosaic for the final N epochs.")
    parser.add_argument(
        "--cos-lr",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Use cosine learning-rate scheduling.",
    )
    parser.add_argument(
        "--deterministic",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable deterministic training for reproducibility.",
    )
    parser.add_argument(
        "--multi-scale",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Enable multiscale training.",
    )
    parser.add_argument("--save-period", type=int, default=-1, help="Save an intermediate checkpoint every N epochs.")
    parser.add_argument(
        "--eval-splits",
        type=str,
        default="val,test",
        help="Comma-separated splits to evaluate after training/evaluation.",
    )
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold used for evaluation.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold used for evaluation.")
    parser.add_argument(
        "--plots",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Persist Ultralytics training/evaluation plots such as confusion matrices and PR curves.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override output directory. Training defaults to services/ml/models and standalone evaluation defaults to services/ml/mock_training_results.",
    )
    return parser


def create_train_parser(target_key: str) -> argparse.ArgumentParser:
    target = resolve_target(target_key)
    parser = argparse.ArgumentParser(description=f"Train and evaluate the {target.display_name} pipeline.")
    _add_shared_arguments(parser, target=target)
    parser.add_argument("--name", type=str, default=None, help="Optional explicit run name.")
    parser.add_argument("--exist-ok", action="store_true", help="Reuse the same output directory if it already exists.")
    parser.add_argument("--cache", type=str, default=None, help="Ultralytics cache mode, for example `ram` or `disk`.")
    parser.add_argument("--disable-augment", action="store_true", help="Disable target-specific augmentation overrides.")
    return parser


def create_eval_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate a saved YOLOv8 model and write JSON/Markdown reports.")
    parser.add_argument("--target", type=str, default=None, help="Optional training target key used to auto-resolve the latest dataset.")
    parser.add_argument("--model", type=str, required=True, help="Path to a saved `.pt` weights file.")
    parser.add_argument("--dataset", type=str, default=None, help="Path to a dataset directory or its data.yaml file.")
    parser.add_argument("--imgsz", type=int, default=640, help="Evaluation image size.")
    parser.add_argument("--device", type=str, default="", help="Device to use, for example `cpu` or `cuda:0`.")
    parser.add_argument("--eval-splits", type=str, default="val,test", help="Comma-separated dataset splits to evaluate.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold used for evaluation.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold used for evaluation.")
    parser.add_argument(
        "--plots",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Persist Ultralytics evaluation plots.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override output directory. Defaults to services/ml/mock_training_results.",
    )
    parser.add_argument("--name", type=str, default=None, help="Evaluation run name. Defaults to the model folder name.")
    return parser


def _parse_splits(raw_value: str) -> list[str]:
    requested = [item.strip() for item in raw_value.split(",") if item.strip()]
    return requested or ["val"]


def _set_global_seed(seed: int, deterministic: bool) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch, "use_deterministic_algorithms"):
        torch.use_deterministic_algorithms(deterministic, warn_only=True)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.deterministic = deterministic
        torch.backends.cudnn.benchmark = not deterministic


def _capture_runtime_versions() -> dict[str, Any]:
    packages = {}
    for package_name in ("ultralytics", "torch", "torchvision", "numpy", "albumentations"):
        try:
            packages[package_name] = importlib.metadata.version(package_name)
        except importlib.metadata.PackageNotFoundError:
            packages[package_name] = None

    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "packages": packages,
    }


def _evaluation_directory(base_output_dir: Path, run_name: str) -> Path:
    return ensure_directory(base_output_dir / run_name)


def _serialize_evaluation(
    *,
    split_name: str,
    metrics: Any,
    output_dir: Path,
    class_names: list[str],
) -> dict[str, Any]:
    return {
        "split": split_name,
        "generated_at": utc_timestamp(),
        "output_directory": to_relative(output_dir),
        "metrics": extract_detection_metrics(metrics, class_names=class_names),
    }


def evaluate_model(
    *,
    model_path: Path,
    dataset_yaml: Path,
    dataset_summary: dict[str, Any],
    splits: list[str],
    imgsz: int,
    device: str | None,
    conf: float,
    iou: float,
    save_plots: bool,
    output_dir: Path,
) -> dict[str, Any]:
    resolved_model = resolve_weights_path(str(model_path))
    model = YOLO(str(resolved_model))
    evaluations: dict[str, Any] = {}

    for split_name in splits:
        if not path_exists(dataset_yaml, split_name):
            continue

        split_output_dir = ensure_directory(output_dir / split_name)
        metrics = model.val(
            data=str(dataset_yaml),
            split=split_name,
            imgsz=imgsz,
            device=device,
            conf=conf,
            iou=iou,
            plots=save_plots,
            project=str(output_dir),
            name=split_name,
            exist_ok=True,
            verbose=False,
        )
        evaluations[split_name] = _serialize_evaluation(
            split_name=split_name,
            metrics=metrics,
            output_dir=split_output_dir,
            class_names=dataset_summary["class_names"],
        )

    return evaluations


def _build_training_kwargs(args: argparse.Namespace, target: TrainingTarget, dataset_yaml: Path, output_dir: Path, run_name: str) -> dict[str, Any]:
    base_model = resolve_weights_path(args.base_model or target.default_base_model)
    kwargs: dict[str, Any] = {
        "data": str(dataset_yaml),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "project": str(output_dir),
        "name": run_name,
        "exist_ok": args.exist_ok,
        "device": args.device or None,
        "save": True,
        "val": True,
        "plots": args.plots,
        "workers": args.workers,
        "patience": args.patience,
        "seed": args.seed,
        "deterministic": args.deterministic,
        "optimizer": args.optimizer,
        "lr0": args.lr0,
        "lrf": args.lrf,
        "weight_decay": args.weight_decay,
        "warmup_epochs": args.warmup_epochs,
        "close_mosaic": args.close_mosaic,
        "cos_lr": args.cos_lr,
        "multi_scale": args.multi_scale,
        "save_period": args.save_period,
    }

    if args.batch > 0:
        kwargs["batch"] = args.batch
    if args.cache:
        kwargs["cache"] = args.cache
    if not args.disable_augment:
        kwargs.update(target.default_train_overrides)

    return {"base_model": str(base_model), "kwargs": kwargs}


def run_training_pipeline(target_key: str, args: argparse.Namespace) -> dict[str, Any]:
    target = resolve_target(target_key)
    dataset_yaml = resolve_dataset_yaml(target, args.dataset)
    run_name = args.name or f"{target.output_prefix}_{args.version or target.default_version}"
    output_dir = Path(args.output_dir).resolve() if args.output_dir else MODELS_DIR
    ensure_directory(output_dir)
    dataset_summary = inspect_dataset(dataset_yaml)
    _set_global_seed(args.seed, args.deterministic)

    training_payload = _build_training_kwargs(args, target, dataset_yaml, output_dir, run_name)
    traffic_augmentation = None
    if not args.disable_augment:
        traffic_augmentation = patch_ultralytics_albumentations(target.key, target.traffic_augmentation_profile)

    trainer = YOLO(training_payload["base_model"])
    trainer.train(**training_payload["kwargs"])

    run_directory = output_dir / run_name
    best_weights_path = run_directory / "weights" / "best.pt"
    last_weights_path = run_directory / "weights" / "last.pt"
    selected_weights = best_weights_path if best_weights_path.exists() else last_weights_path
    if not selected_weights.exists():
        raise FileNotFoundError(f"No trained weights found in {run_directory / 'weights'}")

    evaluations = evaluate_model(
        model_path=selected_weights,
        dataset_yaml=dataset_yaml,
        dataset_summary=dataset_summary,
        splits=_parse_splits(args.eval_splits),
        imgsz=args.imgsz,
        device=args.device or None,
        conf=args.conf,
        iou=args.iou,
        save_plots=args.plots,
        output_dir=_evaluation_directory(run_directory, "evaluations"),
    )

    training_summary = {
        "base_model": to_relative(resolve_weights_path(training_payload["base_model"])),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch if args.batch > 0 else None,
        "device": args.device or None,
        "workers": args.workers,
        "patience": args.patience,
        "seed": args.seed,
        "deterministic": args.deterministic,
        "optimizer": args.optimizer,
        "lr0": safe_float(args.lr0, digits=6),
        "lrf": safe_float(args.lrf, digits=6),
        "weight_decay": safe_float(args.weight_decay, digits=6),
        "warmup_epochs": safe_float(args.warmup_epochs, digits=4),
        "close_mosaic": args.close_mosaic,
        "cos_lr": args.cos_lr,
        "multi_scale": args.multi_scale,
        "save_period": args.save_period,
        "augmentations": None if args.disable_augment else target.default_train_overrides,
        "traffic_augmentation": traffic_augmentation,
        "effective_train_kwargs": training_payload["kwargs"],
        "effective_eval_kwargs": {
            "splits": _parse_splits(args.eval_splits),
            "imgsz": args.imgsz,
            "device": args.device or None,
            "conf": safe_float(args.conf),
            "iou": safe_float(args.iou),
            "plots": args.plots,
        },
        "runtime_versions": _capture_runtime_versions(),
    }

    reports_dir = ensure_directory(run_directory / "reports")
    report_json_path = reports_dir / "training_summary.json"
    report_markdown_path = reports_dir / "training_summary.md"
    hyperparameters_path = reports_dir / "hyperparameters.json"
    version_metadata_path = reports_dir / "model_version_metadata.json"

    summary = build_summary_payload(
        target=target,
        run_name=run_name,
        dataset_summary=dataset_summary,
        training_summary=training_summary,
        evaluations=evaluations,
        best_weights_path=best_weights_path if best_weights_path.exists() else selected_weights,
        last_weights_path=last_weights_path if last_weights_path.exists() else None,
        report_json_path=report_json_path,
        report_markdown_path=report_markdown_path,
        run_directory=run_directory,
    )
    hyperparameters_payload = {
        "generated_at": utc_timestamp(),
        "run_name": run_name,
        "target": target.key,
        "dataset": dataset_summary["data_yaml"],
        "base_model": training_summary["base_model"],
        "train_kwargs": training_payload["kwargs"],
        "eval_kwargs": training_summary["effective_eval_kwargs"],
        "traffic_augmentation": traffic_augmentation,
    }
    version_metadata_payload = {
        "generated_at": utc_timestamp(),
        "model_version": args.version or target.default_version,
        "run_name": run_name,
        "target": target.key,
        "display_name": target.display_name,
        "base_model": training_summary["base_model"],
        "dataset_name": dataset_summary["dataset_name"],
        "dataset_yaml": dataset_summary["data_yaml"],
        "seed": args.seed,
        "deterministic": args.deterministic,
        "weights": {
            "best": to_relative(best_weights_path if best_weights_path.exists() else selected_weights),
            "last": to_relative(last_weights_path) if last_weights_path.exists() else None,
        },
        "hyperparameters": {
            "optimizer": args.optimizer,
            "imgsz": args.imgsz,
            "epochs": args.epochs,
            "patience": args.patience,
            "lr0": safe_float(args.lr0, digits=6),
            "lrf": safe_float(args.lrf, digits=6),
            "weight_decay": safe_float(args.weight_decay, digits=6),
            "warmup_epochs": safe_float(args.warmup_epochs, digits=4),
            "close_mosaic": args.close_mosaic,
            "cos_lr": args.cos_lr,
            "multi_scale": args.multi_scale,
            "augmentations": target.default_train_overrides if not args.disable_augment else None,
            "traffic_augmentation": traffic_augmentation,
        },
        "runtime_versions": training_summary["runtime_versions"],
    }
    summary["artifacts"]["reports"].extend(
        [
            to_relative(hyperparameters_path),
            to_relative(version_metadata_path),
        ]
    )

    write_json(report_json_path, summary)
    write_text(report_markdown_path, render_report_markdown(summary))
    write_json(hyperparameters_path, hyperparameters_payload)
    write_json(version_metadata_path, version_metadata_payload)
    write_json(run_directory / "metrics_metadata.json", _build_legacy_metrics_payload(summary))
    return summary


def run_evaluation_pipeline(args: argparse.Namespace) -> dict[str, Any]:
    target = resolve_target(args.target) if args.target else None
    if target:
        dataset_yaml = resolve_dataset_yaml(target, args.dataset)
    else:
        if not args.dataset:
            raise ValueError("`--dataset` is required when `--target` is not provided.")
        dataset_yaml = Path(args.dataset).resolve()
    if not dataset_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {dataset_yaml}")

    model_path = resolve_weights_path(args.model)
    output_root = Path(args.output_dir).resolve() if args.output_dir else DEFAULT_RESULTS_DIR
    run_name = args.name or f"{model_path.stem}_evaluation"
    run_directory = ensure_directory(output_root / run_name)
    dataset_summary = inspect_dataset(dataset_yaml)
    evaluations = evaluate_model(
        model_path=model_path,
        dataset_yaml=dataset_yaml,
        dataset_summary=dataset_summary,
        splits=_parse_splits(args.eval_splits),
        imgsz=args.imgsz,
        device=args.device or None,
        conf=args.conf,
        iou=args.iou,
        save_plots=args.plots,
        output_dir=_evaluation_directory(run_directory, "evaluations"),
    )

    summary = {
        "generated_at": utc_timestamp(),
        "run_name": run_name,
        "target": {
            "key": target.key,
            "display_name": target.display_name,
        } if target else None,
        "model_path": to_relative(model_path),
        "dataset": dataset_summary,
        "evaluation": {
            "imgsz": args.imgsz,
            "device": args.device or None,
            "conf": safe_float(args.conf),
            "iou": safe_float(args.iou),
            "splits": evaluations,
        },
        "artifacts": {
            "run_directory": to_relative(run_directory),
        },
    }

    report_json_path = run_directory / "evaluation_summary.json"
    report_markdown_path = run_directory / "evaluation_summary.md"
    write_json(report_json_path, summary)
    write_text(report_markdown_path, _render_evaluation_markdown(summary))
    return summary


def _build_legacy_metrics_payload(summary: dict[str, Any]) -> dict[str, Any]:
    validation_metrics = summary["evaluations"].get("val", {}).get("metrics", {})
    test_metrics = summary["evaluations"].get("test", {}).get("metrics", {})
    return {
        "generated_at": summary["generated_at"],
        "version": summary["run_name"],
        "epochs": summary["training"]["epochs"],
        "imgsz": summary["training"]["imgsz"],
        "dataset": summary["dataset"]["dataset_name"],
        "mAP50": validation_metrics.get("map50"),
        "mAP50-95": validation_metrics.get("map50_95"),
        "precision": validation_metrics.get("precision"),
        "recall": validation_metrics.get("recall"),
        "test_mAP50": test_metrics.get("map50"),
        "test_mAP50-95": test_metrics.get("map50_95"),
    }


def _render_evaluation_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Model Evaluation Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Model: `{summary['model_path']}`",
        f"- Dataset: `{summary['dataset']['dataset_name']}`",
        "",
        "## Metrics",
        "",
    ]

    for split_name, payload in summary["evaluation"]["splits"].items():
        metrics = payload["metrics"]
        lines.extend(
            [
                f"### {split_name.title()} Split",
                "",
                f"- Precision: {metrics['precision']}",
                f"- Recall: {metrics['recall']}",
                f"- mAP@50: {metrics['map50']}",
                f"- mAP@50-95: {metrics['map50_95']}",
                "",
            ]
        )

    return "\n".join(lines)

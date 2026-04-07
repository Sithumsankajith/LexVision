from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

from ultralytics import YOLO

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


def _add_shared_arguments(parser: argparse.ArgumentParser, *, include_version: bool = True) -> argparse.ArgumentParser:
    if include_version:
        parser.add_argument("--version", type=str, help="Run version tag used in the output folder name.")
    parser.add_argument("--dataset", type=str, default=None, help="Path to a dataset directory or its data.yaml file.")
    parser.add_argument("--base-model", type=str, default=None, help="Base YOLO weights to fine-tune.")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs.")
    parser.add_argument("--imgsz", type=int, default=640, help="Training/evaluation image size.")
    parser.add_argument("--batch", type=int, default=-1, help="Batch size. Use -1 for Ultralytics auto-batch.")
    parser.add_argument("--device", type=str, default="", help="Device to use, for example `cpu` or `cuda:0`.")
    parser.add_argument("--workers", type=int, default=4, help="Number of dataloader workers.")
    parser.add_argument("--patience", type=int, default=20, help="Early stopping patience.")
    parser.add_argument("--seed", type=int, default=42, help="Training seed.")
    parser.add_argument(
        "--eval-splits",
        type=str,
        default="val,test",
        help="Comma-separated splits to evaluate after training/evaluation.",
    )
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold used for evaluation.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold used for evaluation.")
    parser.add_argument("--plots", action="store_true", help="Persist Ultralytics evaluation plots.")
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
    _add_shared_arguments(parser)
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
    parser.add_argument("--plots", action="store_true", help="Persist Ultralytics evaluation plots.")
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

    training_payload = _build_training_kwargs(args, target, dataset_yaml, output_dir, run_name)
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
        "augmentations": None if args.disable_augment else target.default_train_overrides,
    }

    reports_dir = ensure_directory(run_directory / "reports")
    report_json_path = reports_dir / "training_summary.json"
    report_markdown_path = reports_dir / "training_summary.md"

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

    write_json(report_json_path, summary)
    write_text(report_markdown_path, render_report_markdown(summary))
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

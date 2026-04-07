from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

BASE_DIR = Path(__file__).resolve().parents[1]
DATASETS_DIR = BASE_DIR / "datasets"
MODELS_DIR = BASE_DIR / "models"
DEFAULT_RESULTS_DIR = BASE_DIR / "mock_training_results"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(frozen=True)
class TrainingTarget:
    key: str
    display_name: str
    dataset_glob: str
    output_prefix: str
    default_base_model: str
    default_version: str
    description: str
    default_train_overrides: dict[str, Any]


TRAINING_TARGETS: dict[str, TrainingTarget] = {
    "helmet": TrainingTarget(
        key="helmet",
        display_name="Helmet Detection",
        dataset_glob="Helmet/*.yolov8/data.yaml",
        output_prefix="helmet",
        default_base_model="yolov8n.pt",
        default_version="v2.0.0",
        description="YOLOv8 detector for helmet non-compliance evidence.",
        default_train_overrides={
            "hsv_h": 0.015,
            "hsv_s": 0.7,
            "hsv_v": 0.4,
            "degrees": 10.0,
            "translate": 0.1,
            "scale": 0.5,
            "shear": 0.0,
            "perspective": 0.0,
            "flipud": 0.0,
            "fliplr": 0.5,
            "mosaic": 1.0,
            "mixup": 0.1,
        },
    ),
    "anpr": TrainingTarget(
        key="anpr",
        display_name="Automatic Number Plate Recognition",
        dataset_glob="NumberPlate/*.yolov8/data.yaml",
        output_prefix="anpr",
        default_base_model="yolov8n.pt",
        default_version="v9.0.0",
        description="YOLOv8 detector for license plate localization before OCR.",
        default_train_overrides={
            "hsv_h": 0.015,
            "hsv_s": 0.7,
            "hsv_v": 0.4,
            "degrees": 7.5,
            "translate": 0.1,
            "scale": 0.35,
            "shear": 0.0,
            "perspective": 0.0,
            "flipud": 0.0,
            "fliplr": 0.5,
            "mosaic": 1.0,
            "mixup": 0.05,
        },
    ),
}


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def to_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(BASE_DIR.resolve()))
    except ValueError:
        return str(path.resolve())


def safe_float(value: Any, digits: int = 4) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    ensure_directory(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def write_text(path: Path, contents: str) -> None:
    ensure_directory(path.parent)
    path.write_text(contents, encoding="utf-8")


def dataset_version_key(path: Path) -> tuple[int, str]:
    match = re.search(r"\.v(\d+)i\.yolov8$", path.parent.name)
    version_number = int(match.group(1)) if match else -1
    return version_number, path.parent.name.lower()


def resolve_target(target_key: str) -> TrainingTarget:
    try:
        return TRAINING_TARGETS[target_key]
    except KeyError as exc:
        valid = ", ".join(sorted(TRAINING_TARGETS))
        raise ValueError(f"Unknown target '{target_key}'. Expected one of: {valid}") from exc


def resolve_dataset_yaml(target: TrainingTarget, dataset: str | None = None) -> Path:
    if dataset:
        candidate = Path(dataset)
        if not candidate.is_absolute():
            candidate = BASE_DIR / dataset
        if candidate.is_dir():
            candidate = candidate / "data.yaml"
        if not candidate.exists():
            raise FileNotFoundError(f"Dataset config not found: {candidate}")
        return candidate.resolve()

    candidates = sorted(DATASETS_DIR.glob(target.dataset_glob), key=dataset_version_key, reverse=True)
    if not candidates:
        raise FileNotFoundError(
            f"No dataset YAMLs found for target '{target.key}' with pattern '{target.dataset_glob}'."
        )
    return candidates[0].resolve()


def resolve_weights_path(model_reference: str) -> Path:
    reference = Path(model_reference)
    candidates = [reference]

    if not reference.is_absolute():
        candidates.extend(
            [
                BASE_DIR / model_reference,
                MODELS_DIR / model_reference,
            ]
        )

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    return reference


def detect_split_path(dataset_yaml: Path, split_name: str) -> Path | None:
    config = read_yaml(dataset_yaml)
    split_value = config.get(split_name)
    if not split_value:
        return None

    candidate = Path(split_value)
    if not candidate.is_absolute():
        candidate = (dataset_yaml.parent / candidate).resolve()
    if candidate.exists():
        return candidate

    relative_split = Path(split_value)
    cleaned_parts = [part for part in relative_split.parts if part not in {".", ".."}]
    if cleaned_parts:
        normalized_candidate = (dataset_yaml.parent / Path(*cleaned_parts)).resolve()
        if normalized_candidate.exists():
            return normalized_candidate

    fallback_directories = {
        "train": dataset_yaml.parent / "train" / "images",
        "val": dataset_yaml.parent / "valid" / "images",
        "test": dataset_yaml.parent / "test" / "images",
    }
    fallback = fallback_directories.get(split_name)
    if fallback and fallback.exists():
        return fallback.resolve()

    return None


def count_images(path: Path | None) -> int:
    if path is None or not path.exists():
        return 0
    return sum(1 for file_path in path.rglob("*") if file_path.suffix.lower() in IMAGE_EXTENSIONS)


def inspect_dataset(dataset_yaml: Path) -> dict[str, Any]:
    config = read_yaml(dataset_yaml)
    train_path = detect_split_path(dataset_yaml, "train")
    val_path = detect_split_path(dataset_yaml, "val")
    test_path = detect_split_path(dataset_yaml, "test")

    class_names = config.get("names", [])
    if isinstance(class_names, dict):
        ordered = [class_names[key] for key in sorted(class_names)]
    else:
        ordered = list(class_names)

    return {
        "data_yaml": to_relative(dataset_yaml),
        "dataset_name": dataset_yaml.parent.name,
        "class_count": config.get("nc", len(ordered)),
        "class_names": ordered,
        "splits": {
            "train": {
                "path": to_relative(train_path) if train_path else None,
                "image_count": count_images(train_path),
            },
            "val": {
                "path": to_relative(val_path) if val_path else None,
                "image_count": count_images(val_path),
            },
            "test": {
                "path": to_relative(test_path) if test_path else None,
                "image_count": count_images(test_path),
            },
        },
    }


def path_exists(dataset_yaml: Path, split_name: str) -> bool:
    return detect_split_path(dataset_yaml, split_name) is not None


def extract_detection_metrics(metrics: Any, class_names: list[str] | None = None) -> dict[str, Any]:
    results_dict = getattr(metrics, "results_dict", {}) or {}
    box = getattr(metrics, "box", None)

    mean_results: list[Any] = []
    if box is not None and hasattr(box, "mean_results"):
        try:
            mean_results = list(box.mean_results())
        except TypeError:
            mean_results = list(box.mean_results)

    resolved_class_names = class_names or []
    if not resolved_class_names:
        names = getattr(metrics, "names", {}) or {}
        if isinstance(names, dict):
            resolved_class_names = [names[key] for key in sorted(names)]
        else:
            resolved_class_names = list(names)

    per_class_map = getattr(box, "maps", None) if box is not None else None
    per_class_metrics: list[dict[str, Any]] = []
    if per_class_map is not None and (not resolved_class_names or len(per_class_map) == len(resolved_class_names)):
        for index, value in enumerate(per_class_map):
            label = resolved_class_names[index] if index < len(resolved_class_names) else f"class_{index}"
            per_class_metrics.append({"class_name": label, "map50_95": safe_float(value)})

    speed = getattr(metrics, "speed", {}) or {}

    return {
        "precision": safe_float(results_dict.get("metrics/precision(B)") or (mean_results[0] if len(mean_results) > 0 else None)),
        "recall": safe_float(results_dict.get("metrics/recall(B)") or (mean_results[1] if len(mean_results) > 1 else None)),
        "map50": safe_float(results_dict.get("metrics/mAP50(B)") or getattr(box, "map50", None)),
        "map50_95": safe_float(results_dict.get("metrics/mAP50-95(B)") or getattr(box, "map", None)),
        "fitness": safe_float(results_dict.get("fitness") or getattr(metrics, "fitness", None)),
        "per_class_map50_95": per_class_metrics,
        "speed_ms_per_image": {
            "preprocess": safe_float(speed.get("preprocess")),
            "inference": safe_float(speed.get("inference")),
            "loss": safe_float(speed.get("loss")),
            "postprocess": safe_float(speed.get("postprocess")),
        },
    }


def list_existing_artifacts(directory: Path) -> list[str]:
    if not directory.exists():
        return []

    interesting_files = [
        path
        for path in directory.rglob("*")
        if path.is_file() and path.suffix.lower() in {".csv", ".json", ".png", ".jpg", ".jpeg", ".yaml", ".txt", ".md", ".pt"}
    ]
    return sorted(to_relative(path) for path in interesting_files)


def render_report_markdown(summary: dict[str, Any]) -> str:
    lines = [
        f"# {summary['target']['display_name']} Training Report",
        "",
        f"- Generated: {summary['generated_at']}",
        f"- Run name: `{summary['run_name']}`",
        f"- Dataset: `{summary['dataset']['dataset_name']}`",
        f"- Model weights: `{summary['artifacts']['best_weights']}`",
        "",
        "## Dataset",
        "",
        f"- Train images: {summary['dataset']['splits']['train']['image_count']}",
        f"- Validation images: {summary['dataset']['splits']['val']['image_count']}",
        f"- Test images: {summary['dataset']['splits']['test']['image_count']}",
        f"- Classes: {', '.join(summary['dataset']['class_names']) if summary['dataset']['class_names'] else 'n/a'}",
        "",
        "## Training Configuration",
        "",
        f"- Base model: `{summary['training']['base_model']}`",
        f"- Epochs: {summary['training']['epochs']}",
        f"- Image size: {summary['training']['imgsz']}",
        f"- Batch: {summary['training']['batch'] if summary['training']['batch'] is not None else 'auto'}",
        f"- Device: `{summary['training']['device'] or 'auto'}`",
        f"- Seed: {summary['training']['seed']}",
        "",
        "## Metrics",
        "",
    ]

    for split_name, split_summary in summary["evaluations"].items():
        metrics = split_summary["metrics"]
        lines.extend(
            [
                f"### {split_name.title()} Split",
                "",
                f"- Precision: {metrics['precision']}",
                f"- Recall: {metrics['recall']}",
                f"- mAP@50: {metrics['map50']}",
                f"- mAP@50-95: {metrics['map50_95']}",
                f"- Fitness: {metrics['fitness']}",
                "",
            ]
        )

    lines.extend(
        [
            "## Saved Artifacts",
            "",
            *[f"- `{artifact}`" for artifact in summary["artifacts"]["reports"] + summary["artifacts"]["weights"] + summary["artifacts"]["training_outputs"]],
            "",
        ]
    )
    return "\n".join(lines)


def build_summary_payload(
    *,
    target: TrainingTarget,
    run_name: str,
    dataset_summary: dict[str, Any],
    training_summary: dict[str, Any],
    evaluations: dict[str, Any],
    best_weights_path: Path,
    last_weights_path: Path | None,
    report_json_path: Path,
    report_markdown_path: Path,
    run_directory: Path,
) -> dict[str, Any]:
    training_outputs = list_existing_artifacts(run_directory)
    weights = [to_relative(best_weights_path)]
    if last_weights_path and last_weights_path.exists():
        weights.append(to_relative(last_weights_path))

    return {
        "generated_at": utc_timestamp(),
        "target": asdict(target),
        "run_name": run_name,
        "dataset": dataset_summary,
        "training": training_summary,
        "evaluations": evaluations,
        "artifacts": {
            "run_directory": to_relative(run_directory),
            "best_weights": to_relative(best_weights_path),
            "weights": weights,
            "reports": [to_relative(report_json_path), to_relative(report_markdown_path)],
            "training_outputs": training_outputs,
        },
    }

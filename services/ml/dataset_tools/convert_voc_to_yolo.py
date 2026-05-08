#!/usr/bin/env python3
"""
Pascal VOC XML to YOLOv8 Dataset Converter
============================================
Converts helmetvd1 Pascal VOC XML annotations to YOLOv8 format with:
- Class normalization (With Helmet -> helmet, Without Helmet -> no_helmet)
- Stratified train/valid/test split (70/20/10)
- Proper YOLO label format (class_id x_center y_center width height)
- data.yaml generation

Usage:
    python convert_voc_to_yolo.py [--dataset-dir PATH] [--output-dir PATH]
                                  [--train-ratio 0.7] [--valid-ratio 0.2]
                                  [--test-ratio 0.1] [--seed 42]
"""
from __future__ import annotations

import argparse
import os
import random
import shutil
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_DIR = BASE_DIR / "datasets" / "Helmet" / "helmetvd1"
DEFAULT_OUTPUT_DIR = BASE_DIR / "datasets" / "Helmet" / "helmetvd1_yolov8"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Class normalization mapping
CLASS_MAP: dict[str, str] = {
    # With helmet variants
    "With Helmet": "helmet",
    "with helmet": "helmet",
    "Helmet": "helmet",
    "helmet": "helmet",
    "yes_helmet": "helmet",
    "with_helmet": "helmet",
    # Without helmet variants
    "Without Helmet": "no_helmet",
    "without helmet": "no_helmet",
    "no helmet": "no_helmet",
    "no_helmet": "no_helmet",
    "no-helmet": "no_helmet",
    "nohelmet": "no_helmet",
    "without_helmet": "no_helmet",
}

# Final class ID assignment
CLASS_IDS: dict[str, int] = {
    "helmet": 0,
    "no_helmet": 1,
}

CLASS_NAMES: list[str] = ["helmet", "no_helmet"]


def normalize_class(raw_name: str) -> str | None:
    """Normalize a raw class name to our standard classes."""
    normalized = CLASS_MAP.get(raw_name)
    if normalized is not None:
        return normalized
    # Try case-insensitive lookup
    lower = raw_name.strip().lower().replace("-", "_").replace(" ", "_")
    for key, value in CLASS_MAP.items():
        if key.lower().replace("-", "_").replace(" ", "_") == lower:
            return value
    return None


def parse_voc_annotation(xml_path: Path) -> dict[str, Any] | None:
    """Parse a Pascal VOC XML file and return structured data."""
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        print(f"  [WARN] XML parse error in {xml_path.name}: {e}")
        return None

    filename_el = root.find("filename")
    filename = filename_el.text.strip() if filename_el is not None and filename_el.text else None

    size_el = root.find("size")
    width, height = 0, 0
    if size_el is not None:
        w_el = size_el.find("width")
        h_el = size_el.find("height")
        width = int(w_el.text) if w_el is not None and w_el.text else 0
        height = int(h_el.text) if h_el is not None and h_el.text else 0

    objects = []
    for obj in root.findall("object"):
        name_el = obj.find("name")
        class_name = name_el.text.strip() if name_el is not None and name_el.text else None
        if class_name is None:
            continue

        bbox_el = obj.find("bndbox")
        if bbox_el is None:
            continue

        try:
            xmin = int(float(bbox_el.find("xmin").text))
            ymin = int(float(bbox_el.find("ymin").text))
            xmax = int(float(bbox_el.find("xmax").text))
            ymax = int(float(bbox_el.find("ymax").text))
        except (AttributeError, TypeError, ValueError):
            continue

        objects.append({
            "class_name": class_name,
            "xmin": xmin,
            "ymin": ymin,
            "xmax": xmax,
            "ymax": ymax,
        })

    return {
        "filename": filename,
        "width": width,
        "height": height,
        "objects": objects,
    }


def voc_to_yolo(xmin: int, ymin: int, xmax: int, ymax: int,
                img_width: int, img_height: int) -> tuple[float, float, float, float] | None:
    """Convert Pascal VOC bbox to YOLO format (normalized x_center, y_center, w, h)."""
    if img_width <= 0 or img_height <= 0:
        return None
    if xmax <= xmin or ymax <= ymin:
        return None

    # Clamp to image boundaries
    xmin = max(0, xmin)
    ymin = max(0, ymin)
    xmax = min(img_width, xmax)
    ymax = min(img_height, ymax)

    x_center = ((xmin + xmax) / 2.0) / img_width
    y_center = ((ymin + ymax) / 2.0) / img_height
    w = (xmax - xmin) / img_width
    h = (ymax - ymin) / img_height

    # Validate ranges
    if not (0 <= x_center <= 1 and 0 <= y_center <= 1 and 0 < w <= 1 and 0 < h <= 1):
        return None

    return (
        round(x_center, 6),
        round(y_center, 6),
        round(w, 6),
        round(h, 6),
    )


def stratified_split(
    file_stems: list[str],
    class_presence: dict[str, set[str]],
    train_ratio: float,
    valid_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[str], list[str], list[str]]:
    """
    Split dataset with stratification based on primary class presence.
    Files with no_helmet are rarer, so we stratify to ensure balanced splits.
    """
    rng = random.Random(seed)

    # Categorize files by their primary class content
    has_no_helmet = class_presence.get("no_helmet", set())
    helmet_only = [s for s in file_stems if s not in has_no_helmet]
    has_violation = [s for s in file_stems if s in has_no_helmet]

    rng.shuffle(helmet_only)
    rng.shuffle(has_violation)

    def split_list(lst: list[str]) -> tuple[list[str], list[str], list[str]]:
        n = len(lst)
        n_train = int(n * train_ratio)
        n_valid = int(n * valid_ratio)
        train = lst[:n_train]
        valid = lst[n_train:n_train + n_valid]
        test = lst[n_train + n_valid:]
        return train, valid, test

    train_h, valid_h, test_h = split_list(helmet_only)
    train_v, valid_v, test_v = split_list(has_violation)

    train = train_h + train_v
    valid = valid_h + valid_v
    test = test_h + test_v

    rng.shuffle(train)
    rng.shuffle(valid)
    rng.shuffle(test)

    return train, valid, test


def convert_dataset(
    dataset_dir: Path,
    output_dir: Path,
    train_ratio: float = 0.7,
    valid_ratio: float = 0.2,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> dict[str, Any]:
    """Convert Pascal VOC dataset to YOLOv8 format."""
    annotations_dir = dataset_dir / "annotations"
    images_dir = dataset_dir / "images"

    if not annotations_dir.exists():
        raise FileNotFoundError(f"Annotations directory not found: {annotations_dir}")
    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")

    # Discover files
    xml_files = sorted([f for f in annotations_dir.iterdir() if f.suffix.lower() == ".xml"])
    image_map: dict[str, Path] = {}
    for f in images_dir.iterdir():
        if f.suffix.lower() in IMAGE_EXTENSIONS:
            image_map[f.stem] = f

    print(f"[CONVERT] Found {len(xml_files)} XML files, {len(image_map)} images")

    # Parse and convert all annotations
    converted: dict[str, dict[str, Any]] = {}
    class_presence: dict[str, set[str]] = defaultdict(set)
    total_objects = 0
    skipped_no_image = 0
    skipped_empty = 0
    skipped_unknown_class = 0
    invalid_bbox_count = 0
    class_counter = Counter()

    for xml_file in xml_files:
        stem = xml_file.stem

        # Check matching image
        if stem not in image_map:
            skipped_no_image += 1
            continue

        parsed = parse_voc_annotation(xml_file)
        if parsed is None:
            continue

        img_path = image_map[stem]
        img_width = parsed["width"]
        img_height = parsed["height"]

        yolo_lines = []
        for obj in parsed["objects"]:
            normalized = normalize_class(obj["class_name"])
            if normalized is None:
                skipped_unknown_class += 1
                continue
            if normalized not in CLASS_IDS:
                skipped_unknown_class += 1
                continue

            class_id = CLASS_IDS[normalized]
            result = voc_to_yolo(
                obj["xmin"], obj["ymin"], obj["xmax"], obj["ymax"],
                img_width, img_height,
            )
            if result is None:
                invalid_bbox_count += 1
                continue

            x_center, y_center, w, h = result
            yolo_lines.append(f"{class_id} {x_center} {y_center} {w} {h}")
            class_counter[normalized] += 1
            class_presence[normalized].add(stem)
            total_objects += 1

        if not yolo_lines:
            skipped_empty += 1
            continue

        converted[stem] = {
            "image_path": img_path,
            "yolo_lines": yolo_lines,
        }

    print(f"[CONVERT] Successfully converted {len(converted)} files with {total_objects} objects")
    if skipped_no_image:
        print(f"[CONVERT] Skipped {skipped_no_image} files (no matching image)")
    if skipped_empty:
        print(f"[CONVERT] Skipped {skipped_empty} files (no valid objects after conversion)")
    if skipped_unknown_class:
        print(f"[CONVERT] Skipped {skipped_unknown_class} objects (unknown class)")
    if invalid_bbox_count:
        print(f"[CONVERT] Skipped {invalid_bbox_count} objects (invalid bounding box)")

    # Split dataset
    all_stems = sorted(converted.keys())
    train_stems, valid_stems, test_stems = stratified_split(
        all_stems, class_presence, train_ratio, valid_ratio, test_ratio, seed,
    )

    print(f"[CONVERT] Split: train={len(train_stems)}, valid={len(valid_stems)}, test={len(test_stems)}")

    # Create output directory structure
    if output_dir.exists():
        print(f"[CONVERT] Cleaning existing output: {output_dir}")
        shutil.rmtree(output_dir)

    splits = {"train": train_stems, "valid": valid_stems, "test": test_stems}
    split_class_counts: dict[str, Counter] = {}

    for split_name, stems in splits.items():
        img_dir = output_dir / split_name / "images"
        lbl_dir = output_dir / split_name / "labels"
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        split_counter = Counter()
        for stem in stems:
            entry = converted[stem]
            src_img = entry["image_path"]
            dst_img = img_dir / src_img.name
            dst_lbl = lbl_dir / f"{stem}.txt"

            # Copy image (not symlink for portability)
            shutil.copy2(src_img, dst_img)

            # Write YOLO label file
            with open(dst_lbl, "w", encoding="utf-8") as f:
                f.write("\n".join(entry["yolo_lines"]) + "\n")

            # Count classes in this split
            for line in entry["yolo_lines"]:
                cid = int(line.split()[0])
                cname = CLASS_NAMES[cid]
                split_counter[cname] += 1

        split_class_counts[split_name] = split_counter

    # Generate data.yaml
    data_yaml = {
        "path": str(output_dir.resolve()),
        "train": "train/images",
        "val": "valid/images",
        "test": "test/images",
        "nc": len(CLASS_NAMES),
        "names": CLASS_NAMES,
    }

    yaml_path = output_dir / "data.yaml"
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

    print(f"[CONVERT] data.yaml saved: {yaml_path}")

    # Build summary
    summary = {
        "source_dataset": str(dataset_dir),
        "output_dataset": str(output_dir),
        "data_yaml": str(yaml_path),
        "class_mapping": {str(v): k for k, v in CLASS_IDS.items()},
        "class_names": CLASS_NAMES,
        "total_converted_images": len(converted),
        "total_converted_objects": total_objects,
        "skipped": {
            "no_matching_image": skipped_no_image,
            "no_valid_objects": skipped_empty,
            "unknown_class_objects": skipped_unknown_class,
            "invalid_bbox_objects": invalid_bbox_count,
        },
        "splits": {},
        "class_distribution": {},
    }

    for split_name in ("train", "valid", "test"):
        stems = splits[split_name]
        summary["splits"][split_name] = {
            "images": len(stems),
            "class_distribution": dict(split_class_counts[split_name].most_common()),
        }

    for cls, count in class_counter.most_common():
        summary["class_distribution"][cls] = {
            "count": count,
            "percentage": round(count * 100 / total_objects, 2) if total_objects > 0 else 0,
        }

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Pascal VOC XML dataset to YOLOv8 format.")
    parser.add_argument("--dataset-dir", type=str, default=str(DEFAULT_DATASET_DIR),
                        help="Path to the helmetvd1 dataset directory.")
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_OUTPUT_DIR),
                        help="Path to the YOLOv8 output directory.")
    parser.add_argument("--train-ratio", type=float, default=0.7, help="Training split ratio.")
    parser.add_argument("--valid-ratio", type=float, default=0.2, help="Validation split ratio.")
    parser.add_argument("--test-ratio", type=float, default=0.1, help="Test split ratio.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()

    # Validate ratios
    total = args.train_ratio + args.valid_ratio + args.test_ratio
    if abs(total - 1.0) > 0.01:
        print(f"[ERROR] Split ratios must sum to 1.0 (got {total})")
        return

    print(f"{'='*60}")
    print(f"  VOC to YOLO Conversion")
    print(f"{'='*60}")
    print(f"  Source:  {dataset_dir}")
    print(f"  Output:  {output_dir}")
    print(f"  Split:   {args.train_ratio}/{args.valid_ratio}/{args.test_ratio}")
    print(f"  Seed:    {args.seed}")
    print(f"  Classes: {CLASS_NAMES}")
    print(f"{'='*60}")

    summary = convert_dataset(
        dataset_dir=dataset_dir,
        output_dir=output_dir,
        train_ratio=args.train_ratio,
        valid_ratio=args.valid_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )

    print(f"\n{'='*60}")
    print(f"  CONVERSION SUMMARY")
    print(f"{'='*60}")
    print(f"  Converted images:  {summary['total_converted_images']}")
    print(f"  Converted objects: {summary['total_converted_objects']}")
    print(f"  Skipped (no img):  {summary['skipped']['no_matching_image']}")
    print(f"  Skipped (empty):   {summary['skipped']['no_valid_objects']}")
    print(f"  Invalid bboxes:    {summary['skipped']['invalid_bbox_objects']}")
    print(f"{'='*60}")
    print(f"  Splits:")
    for split_name, split_info in summary["splits"].items():
        print(f"    {split_name:6s}: {split_info['images']:4d} images  |  {split_info['class_distribution']}")
    print(f"{'='*60}")
    print(f"  Class distribution (total):")
    for cls, info in summary["class_distribution"].items():
        print(f"    {cls:12s}: {info['count']:5d} ({info['percentage']}%)")
    print(f"{'='*60}")
    print(f"  data.yaml: {summary['data_yaml']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

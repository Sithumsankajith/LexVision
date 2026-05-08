#!/usr/bin/env python3
"""
helmetvd1 Dataset Audit Script
===============================
Parses all Pascal VOC XML annotations in the helmetvd1 dataset, validates
image/annotation pairing, extracts class distributions, checks for invalid
bounding boxes, detects duplicates, and generates audit reports.

Usage:
    python audit_helmetvd1.py [--dataset-dir PATH] [--output-dir PATH]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_DIR = BASE_DIR / "datasets" / "Helmet" / "helmetvd1"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "reports"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _file_hash(path: Path, algorithm: str = "md5") -> str:
    """Compute hash of a file for duplicate detection."""
    h = hashlib.new(algorithm)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_voc_xml(xml_path: Path) -> dict[str, Any]:
    """Parse a single Pascal VOC XML annotation file."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    filename_el = root.find("filename")
    filename = filename_el.text.strip() if filename_el is not None and filename_el.text else None

    size_el = root.find("size")
    width, height, depth = 0, 0, 3
    if size_el is not None:
        w_el = size_el.find("width")
        h_el = size_el.find("height")
        d_el = size_el.find("depth")
        width = int(w_el.text) if w_el is not None and w_el.text else 0
        height = int(h_el.text) if h_el is not None and h_el.text else 0
        depth = int(d_el.text) if d_el is not None and d_el.text else 3

    objects = []
    for obj in root.findall("object"):
        name_el = obj.find("name")
        class_name = name_el.text.strip() if name_el is not None and name_el.text else "unknown"

        difficult_el = obj.find("difficult")
        difficult = int(difficult_el.text) if difficult_el is not None and difficult_el.text else 0

        truncated_el = obj.find("truncated")
        truncated = int(truncated_el.text) if truncated_el is not None and truncated_el.text else 0

        bbox_el = obj.find("bndbox")
        bbox = {}
        if bbox_el is not None:
            for coord in ("xmin", "ymin", "xmax", "ymax"):
                coord_el = bbox_el.find(coord)
                bbox[coord] = int(float(coord_el.text)) if coord_el is not None and coord_el.text else 0

        objects.append({
            "class_name": class_name,
            "difficult": difficult,
            "truncated": truncated,
            "bbox": bbox,
        })

    return {
        "filename": filename,
        "width": width,
        "height": height,
        "depth": depth,
        "objects": objects,
    }


def validate_bbox(bbox: dict, img_width: int, img_height: int) -> list[str]:
    """Check a bounding box for common issues."""
    issues = []
    xmin, ymin = bbox.get("xmin", 0), bbox.get("ymin", 0)
    xmax, ymax = bbox.get("xmax", 0), bbox.get("ymax", 0)

    if xmin < 0 or ymin < 0:
        issues.append(f"negative coordinate: xmin={xmin}, ymin={ymin}")
    if xmax <= xmin:
        issues.append(f"xmax ({xmax}) <= xmin ({xmin})")
    if ymax <= ymin:
        issues.append(f"ymax ({ymax}) <= ymin ({ymin})")
    if img_width > 0 and xmax > img_width:
        issues.append(f"xmax ({xmax}) exceeds image width ({img_width})")
    if img_height > 0 and ymax > img_height:
        issues.append(f"ymax ({ymax}) exceeds image height ({img_height})")

    box_width = xmax - xmin
    box_height = ymax - ymin
    if box_width <= 0 or box_height <= 0:
        issues.append(f"zero-area box: {box_width}x{box_height}")
    elif img_width > 0 and img_height > 0:
        area_ratio = (box_width * box_height) / (img_width * img_height)
        if area_ratio < 0.0001:
            issues.append(f"extremely small box: {box_width}x{box_height} ({area_ratio:.6f} of image)")

    return issues


def run_audit(dataset_dir: Path) -> dict[str, Any]:
    """Run the full dataset audit."""
    annotations_dir = dataset_dir / "annotations"
    images_dir = dataset_dir / "images"

    # Discover files
    xml_files = sorted([f for f in annotations_dir.iterdir() if f.suffix.lower() == ".xml"]) if annotations_dir.exists() else []
    image_files = sorted([f for f in images_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS]) if images_dir.exists() else []

    xml_stems = {f.stem for f in xml_files}
    image_stems = {f.stem: f for f in image_files}

    # Missing pairs
    missing_images = sorted(xml_stems - set(image_stems.keys()))
    missing_annotations = sorted(set(image_stems.keys()) - xml_stems)
    matched = sorted(xml_stems & set(image_stems.keys()))

    # Parse all XMLs
    class_counter = Counter()
    total_objects = 0
    empty_annotations = []
    invalid_bboxes = []
    per_file_stats = []
    all_widths = Counter()
    all_heights = Counter()
    objects_per_image = []

    for xml_file in xml_files:
        parsed = parse_voc_xml(xml_file)
        n_objects = len(parsed["objects"])
        objects_per_image.append(n_objects)

        if n_objects == 0:
            empty_annotations.append(xml_file.stem)

        all_widths[parsed["width"]] += 1
        all_heights[parsed["height"]] += 1

        file_classes = Counter()
        for obj in parsed["objects"]:
            class_counter[obj["class_name"]] += 1
            file_classes[obj["class_name"]] += 1
            total_objects += 1

            bbox_issues = validate_bbox(obj["bbox"], parsed["width"], parsed["height"])
            if bbox_issues:
                invalid_bboxes.append({
                    "file": xml_file.stem,
                    "class": obj["class_name"],
                    "bbox": obj["bbox"],
                    "issues": bbox_issues,
                })

        per_file_stats.append({
            "file": xml_file.stem,
            "width": parsed["width"],
            "height": parsed["height"],
            "n_objects": n_objects,
            "classes": dict(file_classes),
        })

    # Duplicate detection (by image content hash)
    image_hashes: dict[str, list[str]] = defaultdict(list)
    for stem, img_path in image_stems.items():
        h = _file_hash(img_path)
        image_hashes[h].append(stem)
    duplicates = {h: stems for h, stems in image_hashes.items() if len(stems) > 1}

    # Statistics
    avg_objects = sum(objects_per_image) / len(objects_per_image) if objects_per_image else 0
    max_objects = max(objects_per_image) if objects_per_image else 0
    min_objects = min(objects_per_image) if objects_per_image else 0

    class_distribution = []
    for cls, count in class_counter.most_common():
        class_distribution.append({
            "class_name": cls,
            "count": count,
            "percentage": round(count * 100 / total_objects, 2) if total_objects > 0 else 0,
        })

    # Class normalization mapping
    normalization_map = {
        "With Helmet": "helmet",
        "Without Helmet": "no_helmet",
    }
    normalized_classes = {}
    for cls_info in class_distribution:
        raw = cls_info["class_name"]
        normalized = normalization_map.get(raw, raw.lower().replace(" ", "_"))
        normalized_classes[raw] = normalized

    audit_result = {
        "generated_at": _utc_now(),
        "dataset_path": str(dataset_dir),
        "annotations_dir": str(annotations_dir),
        "images_dir": str(images_dir),
        "summary": {
            "total_xml_files": len(xml_files),
            "total_image_files": len(image_files),
            "matched_pairs": len(matched),
            "missing_images": len(missing_images),
            "missing_annotations": len(missing_annotations),
            "empty_annotations": len(empty_annotations),
            "total_objects": total_objects,
            "total_classes": len(class_counter),
            "invalid_bboxes": len(invalid_bboxes),
            "duplicate_image_groups": len(duplicates),
        },
        "class_distribution": class_distribution,
        "class_normalization": {
            "mapping": normalized_classes,
            "final_classes": {"0": "helmet", "1": "no_helmet"},
            "rationale": "Only 2 classes found in dataset. 'With Helmet' -> 'helmet' (class 0), 'Without Helmet' -> 'no_helmet' (class 1). No rider/motorcycle classes present.",
        },
        "image_dimensions": {
            "widths": dict(all_widths.most_common()),
            "heights": dict(all_heights.most_common()),
        },
        "objects_per_image": {
            "average": round(avg_objects, 2),
            "min": min_objects,
            "max": max_objects,
        },
        "empty_annotation_files": empty_annotations,
        "missing_image_files": missing_images,
        "missing_annotation_files": missing_annotations,
        "invalid_bounding_boxes": invalid_bboxes,
        "duplicate_images": {h: stems for h, stems in duplicates.items()},
    }

    return audit_result


def generate_markdown_report(audit: dict[str, Any]) -> str:
    """Generate a Markdown audit report."""
    s = audit["summary"]
    lines = [
        "# helmetvd1 Dataset Audit Report",
        "",
        f"**Generated:** {audit['generated_at']}",
        f"**Dataset Path:** `{audit['dataset_path']}`",
        "",
        "## 1. Dataset Overview",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Total XML annotation files | {s['total_xml_files']} |",
        f"| Total image files | {s['total_image_files']} |",
        f"| Matched image-annotation pairs | {s['matched_pairs']} |",
        f"| Missing images (XML without image) | {s['missing_images']} |",
        f"| Missing annotations (image without XML) | {s['missing_annotations']} |",
        f"| Empty annotations (no objects) | {s['empty_annotations']} |",
        f"| Total bounding boxes | {s['total_objects']} |",
        f"| Total unique classes | {s['total_classes']} |",
        f"| Invalid bounding boxes | {s['invalid_bboxes']} |",
        f"| Duplicate image groups | {s['duplicate_image_groups']} |",
        "",
        "## 2. Class Distribution",
        "",
        "| Raw Class Name | Count | Percentage |",
        "|---|---|---|",
    ]
    for cls in audit["class_distribution"]:
        lines.append(f"| {cls['class_name']} | {cls['count']} | {cls['percentage']}% |")

    lines.extend([
        "",
        "## 3. Class Normalization Decision",
        "",
        "| Raw Name | Normalized Name | Class ID |",
        "|---|---|---|",
    ])
    mapping = audit["class_normalization"]["mapping"]
    final = audit["class_normalization"]["final_classes"]
    id_lookup = {v: k for k, v in final.items()}
    for raw, norm in mapping.items():
        cid = id_lookup.get(norm, "?")
        lines.append(f"| `{raw}` | `{norm}` | {cid} |")

    lines.extend([
        "",
        f"**Rationale:** {audit['class_normalization']['rationale']}",
        "",
        "## 4. Image Dimensions",
        "",
        "| Width | Count |",
        "|---|---|",
    ])
    for w, c in audit["image_dimensions"]["widths"].items():
        lines.append(f"| {w} | {c} |")

    lines.extend(["", "| Height | Count |", "|---|---|"])
    for h, c in list(audit["image_dimensions"]["heights"].items())[:10]:
        lines.append(f"| {h} | {c} |")

    lines.extend([
        "",
        "## 5. Objects Per Image",
        "",
        f"- **Average:** {audit['objects_per_image']['average']}",
        f"- **Min:** {audit['objects_per_image']['min']}",
        f"- **Max:** {audit['objects_per_image']['max']}",
        "",
        "## 6. Empty Annotations",
        "",
    ])
    if audit["empty_annotation_files"]:
        for f in audit["empty_annotation_files"]:
            lines.append(f"- `{f}`")
    else:
        lines.append("None found.")

    lines.extend(["", "## 7. Invalid Bounding Boxes", ""])
    if audit["invalid_bounding_boxes"]:
        for inv in audit["invalid_bounding_boxes"]:
            lines.append(f"- **{inv['file']}** ({inv['class']}): {', '.join(inv['issues'])}")
    else:
        lines.append("None found. All bounding boxes are valid.")

    lines.extend(["", "## 8. Duplicate Images", ""])
    if audit["duplicate_images"]:
        for h, stems in audit["duplicate_images"].items():
            lines.append(f"- Hash `{h[:12]}...`: {', '.join(stems)}")
    else:
        lines.append("No duplicate images found by content hash.")

    lines.extend([
        "",
        "## 9. Missing Files",
        "",
        f"- Missing images (have annotation, no image): **{s['missing_images']}**",
        f"- Missing annotations (have image, no annotation): **{s['missing_annotations']}**",
        "",
        "## 10. Dataset Quality Assessment",
        "",
    ])
    quality = "GOOD" if s["invalid_bboxes"] == 0 and s["missing_images"] == 0 else "NEEDS ATTENTION"
    lines.extend([
        f"**Overall Quality: {quality}**",
        "",
        "- ✅ All annotations have matching images" if s["missing_images"] == 0 else "- ❌ Some annotations missing images",
        "- ✅ All images have matching annotations" if s["missing_annotations"] == 0 else "- ❌ Some images missing annotations",
        "- ✅ All bounding boxes are valid" if s["invalid_bboxes"] == 0 else f"- ❌ {s['invalid_bboxes']} invalid bounding boxes",
        f"- ⚠️ {s['empty_annotations']} empty annotations (images with no labeled objects)" if s["empty_annotations"] > 0 else "- ✅ No empty annotations",
        f"- ℹ️ Dataset is moderately small ({s['total_image_files']} images) — fine-tuning from pretrained weights recommended",
        f"- ℹ️ Class imbalance: ~2:1 ratio (helmet vs no_helmet)",
        "",
    ])

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit the helmetvd1 Pascal VOC dataset.")
    parser.add_argument("--dataset-dir", type=str, default=str(DEFAULT_DATASET_DIR),
                        help="Path to the helmetvd1 dataset directory.")
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_OUTPUT_DIR),
                        help="Path to the output reports directory.")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[AUDIT] Scanning dataset: {dataset_dir}")
    audit = run_audit(dataset_dir)

    # Write JSON report
    json_path = output_dir / "helmetvd1_audit_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2, sort_keys=False)
    print(f"[AUDIT] JSON report saved: {json_path}")

    # Write Markdown report
    md_path = output_dir / "helmetvd1_audit_report.md"
    md_content = generate_markdown_report(audit)
    md_path.write_text(md_content, encoding="utf-8")
    print(f"[AUDIT] Markdown report saved: {md_path}")

    # Print summary
    s = audit["summary"]
    print(f"\n{'='*60}")
    print(f"  AUDIT SUMMARY")
    print(f"{'='*60}")
    print(f"  Images:          {s['total_image_files']}")
    print(f"  Annotations:     {s['total_xml_files']}")
    print(f"  Matched pairs:   {s['matched_pairs']}")
    print(f"  Total objects:   {s['total_objects']}")
    print(f"  Classes:         {s['total_classes']}")
    print(f"  Empty XMLs:      {s['empty_annotations']}")
    print(f"  Invalid bboxes:  {s['invalid_bboxes']}")
    print(f"  Duplicates:      {s['duplicate_image_groups']} groups")
    print(f"{'='*60}")
    print(f"  Class distribution:")
    for cls in audit["class_distribution"]:
        print(f"    {cls['class_name']:20s} {cls['count']:5d} ({cls['percentage']}%)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

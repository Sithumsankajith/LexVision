#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2

try:
    from services.ml.inference.anpr_pipeline import run_anpr_pipeline
except ModuleNotFoundError:
    from inference.anpr_pipeline import run_anpr_pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run LexVision ANPR inference on one image.")
    parser.add_argument("--image", required=True, help="Path to an image file.")
    return parser.parse_args()


def _bbox_to_xyxy(bbox: dict | None) -> tuple[int, int, int, int] | None:
    if not bbox:
        return None
    if all(bbox.get(key) is not None for key in ("x1", "y1", "x2", "y2")):
        return tuple(int(float(bbox[key])) for key in ("x1", "y1", "x2", "y2"))
    if all(bbox.get(key) is not None for key in ("x", "y", "width", "height")):
        x = float(bbox["x"])
        y = float(bbox["y"])
        width = float(bbox["width"])
        height = float(bbox["height"])
        return (
            int(x - width / 2),
            int(y - height / 2),
            int(x + width / 2),
            int(y + height / 2),
        )
    return None


def _save_debug_image(image_path: Path, result: dict) -> str | None:
    image = cv2.imread(str(image_path))
    xyxy = _bbox_to_xyxy(result.get("plate_bbox") or result.get("bbox"))
    if image is None or xyxy is None:
        return None

    x1, y1, x2, y2 = xyxy
    cv2.rectangle(image, (x1, y1), (x2, y2), (0, 180, 80), 2)
    cv2.putText(
        image,
        "Number Plate",
        (max(0, x1), max(20, y1 - 8)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 180, 80),
        2,
        cv2.LINE_AA,
    )

    debug_dir = Path(__file__).resolve().parent / "storage" / "anpr_debug"
    debug_dir.mkdir(parents=True, exist_ok=True)
    debug_path = debug_dir / f"{image_path.stem}_anpr_debug_{int(time.time() * 1000)}.jpg"
    cv2.imwrite(str(debug_path), image)
    return str(debug_path)


def main() -> int:
    args = parse_args()
    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 2
    result = run_anpr_pipeline(str(image_path))
    debug_image_path = _save_debug_image(image_path, result)
    if debug_image_path:
        result["debug_image_path"] = debug_image_path
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") in {"success", "no_plate", "ocr_failed", "model_missing"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

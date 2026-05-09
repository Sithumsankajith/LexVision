#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from services.ml.inference.anpr_pipeline import run_anpr_pipeline
except ModuleNotFoundError:
    from inference.anpr_pipeline import run_anpr_pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run LexVision ANPR inference on one image.")
    parser.add_argument("--image", required=True, help="Path to an image file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 2
    result = run_anpr_pipeline(str(image_path))
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") in {"success", "no_plate", "ocr_failed", "model_missing"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

try:
    from services.ml.inference.helmet_roboflow import run_helmet_detection
except ModuleNotFoundError as exc:
    if exc.name not in {"services", "services.ml", "services.ml.inference", "services.ml.inference.helmet_roboflow"}:
        raise
    from inference.helmet_roboflow import run_helmet_detection


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Roboflow helmet detection on a single test image.")
    parser.add_argument("--image", required=True, help="Path to the test image.")
    parser.add_argument(
        "--output",
        default=None,
        help="Optional path for the output JSON file. Defaults to services/ml/temp/<image>_helmet_detection.json",
    )
    args = parser.parse_args()

    image_path = Path(args.image).expanduser()
    output_path = (
        Path(args.output).expanduser()
        if args.output
        else BASE_DIR / "temp" / f"{image_path.stem}_helmet_detection.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    result = run_helmet_detection(str(image_path))
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"Image: {image_path.resolve()}")
    print(f"Output JSON: {output_path.resolve()}")
    print(f"Status: {result.get('status')}")
    print(f"Helmet violation detected: {result.get('has_helmet_violation')}")
    print(f"Best violation confidence: {result.get('confidence')}")
    print(json.dumps(result, indent=2))

    return 1 if result.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())

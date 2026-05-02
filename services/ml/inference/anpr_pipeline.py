from __future__ import annotations

from typing import Any


def run_anpr_pipeline(image_path: str | None) -> dict[str, Any]:
    return {
        "plate_text": None,
        "status": "pending",
    }

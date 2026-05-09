from __future__ import annotations

import re
from dataclasses import asdict, dataclass


LETTER_TO_DIGIT_MAP = str.maketrans(
    {
        "O": "0",
        "Q": "0",
        "D": "0",
        "I": "1",
        "L": "1",
        "Z": "2",
        "S": "5",
        "B": "8",
        "G": "6",
    }
)
DIGIT_TO_LETTER_MAP = str.maketrans(
    {
        "0": "O",
        "1": "I",
        "2": "Z",
        "5": "S",
        "6": "G",
        "8": "B",
    }
)

ALNUM_RE = re.compile(r"[^A-Z0-9]")
SRI_LANKAN_SERIES_RE = re.compile(r"^[A-Z]{2,5}\d{4}$")
SRI_LANKAN_NUMERIC_RE = re.compile(r"^\d{6}$")


@dataclass(frozen=True)
class PlateNormalizationResult:
    raw_text: str | None
    compact_text: str | None
    normalized_text: str | None
    display_text: str | None
    status: str

    def to_dict(self) -> dict[str, str | None]:
        return asdict(self)


def compact_plate_text(raw_text: str | None) -> str | None:
    if raw_text is None:
        return None
    compact = ALNUM_RE.sub("", raw_text.upper())
    return compact or None


def _normalize_numeric_plate(compact: str) -> PlateNormalizationResult | None:
    digit_candidate = compact.translate(LETTER_TO_DIGIT_MAP)
    if not SRI_LANKAN_NUMERIC_RE.fullmatch(digit_candidate):
        return None

    display_text = f"{digit_candidate[:2]}-{digit_candidate[2:]}"
    status = "valid_sri_lankan_numeric_format" if digit_candidate == compact else "normalized_sri_lankan_numeric_format"
    return PlateNormalizationResult(
        raw_text=compact,
        compact_text=compact,
        normalized_text=display_text,
        display_text=display_text,
        status=status,
    )


def normalize_sri_lankan_plate(raw_text: str | None) -> PlateNormalizationResult:
    compact = compact_plate_text(raw_text)
    if not compact:
        return PlateNormalizationResult(
            raw_text=raw_text,
            compact_text=None,
            normalized_text=None,
            display_text=None,
            status="no_text_detected",
        )

    numeric_result = _normalize_numeric_plate(compact)
    if numeric_result is not None:
        return numeric_result

    if len(compact) < 6:
        return PlateNormalizationResult(
            raw_text=raw_text,
            compact_text=compact,
            normalized_text=compact,
            display_text=compact,
            status="invalid_sri_lankan_format",
        )

    prefix = compact[:-4].translate(DIGIT_TO_LETTER_MAP)
    suffix = compact[-4:].translate(LETTER_TO_DIGIT_MAP)
    candidate = f"{prefix}{suffix}"

    if not SRI_LANKAN_SERIES_RE.fullmatch(candidate):
        return PlateNormalizationResult(
            raw_text=raw_text,
            compact_text=compact,
            normalized_text=candidate,
            display_text=candidate,
            status="invalid_sri_lankan_format",
        )

    status = "valid_sri_lankan_format" if candidate == compact else "normalized_sri_lankan_format"
    return PlateNormalizationResult(
        raw_text=raw_text,
        compact_text=compact,
        normalized_text=candidate,
        display_text=candidate,
        status=status,
    )


def normalize_plate_text(raw_text: str | None) -> str | None:
    return normalize_sri_lankan_plate(raw_text).normalized_text

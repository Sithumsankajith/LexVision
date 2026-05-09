from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any


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

SRI_LANKAN_PROVINCE_CODES = {"WP", "CP", "SP", "NP", "EP", "NW", "NC", "UV", "SG"}
CLEAN_RE = re.compile(r"[^A-Z0-9-]")
ALNUM_RE = re.compile(r"[^A-Z0-9]")

FORMAT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("three_letter_series", re.compile(r"^[A-Z]{3}\d{4}$")),
    ("two_letter_series", re.compile(r"^[A-Z]{2}\d{4}$")),
    ("province_three_letter_series", re.compile(r"^(WP|CP|SP|NP|EP|NW|NC|UV|SG)[A-Z]{3}\d{4}$")),
    ("province_two_letter_series", re.compile(r"^(WP|CP|SP|NP|EP|NW|NC|UV|SG)[A-Z]{2}\d{4}$")),
    ("legacy_numeric", re.compile(r"^\d{2}-?\d{4}$")),
)


@dataclass(frozen=True)
class PlateNormalizationResult:
    raw_text: str | None
    compact_text: str | None
    normalized_text: str | None
    display_text: str | None
    status: str
    format_type: str | None = None
    is_valid: bool = False
    confidence_adjustment: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def clean_plate_text(raw_text: str | None) -> str | None:
    """Uppercase OCR text and keep only plate-relevant characters."""
    if raw_text is None:
        return None
    cleaned = CLEAN_RE.sub("", raw_text.upper().replace(" ", ""))
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or None


def compact_plate_text(raw_text: str | None) -> str | None:
    cleaned = clean_plate_text(raw_text)
    if cleaned is None:
        return None
    compact = ALNUM_RE.sub("", cleaned)
    return compact or None


def _format_type(candidate: str) -> str | None:
    for format_type, pattern in FORMAT_PATTERNS:
        if pattern.fullmatch(candidate):
            return format_type
    return None


def validate_sri_lankan_plate(text: str | None) -> bool:
    cleaned = clean_plate_text(text)
    if cleaned is None:
        return False

    compact = ALNUM_RE.sub("", cleaned)
    if _format_type(cleaned) or _format_type(compact):
        return True

    return False


def _normalize_numeric_section(compact: str) -> str:
    if len(compact) == 6 and compact[:2].translate(LETTER_TO_DIGIT_MAP).isdigit():
        return compact.translate(LETTER_TO_DIGIT_MAP)

    if len(compact) < 6:
        return compact

    prefix = compact[:-4].translate(DIGIT_TO_LETTER_MAP)
    suffix = compact[-4:].translate(LETTER_TO_DIGIT_MAP)
    return f"{prefix}{suffix}"


def _display_text(normalized: str, format_type: str | None) -> str:
    if format_type == "legacy_numeric" and "-" not in normalized:
        return f"{normalized[:2]}-{normalized[2:]}"
    return normalized


def score_plate_candidate(text: str | None) -> float:
    """Score OCR candidates for selection; this is not exposed as OCR confidence."""
    cleaned = clean_plate_text(text)
    compact = compact_plate_text(cleaned)
    if not compact:
        return 0.0

    normalized = _normalize_numeric_section(compact)
    format_type = _format_type(normalized) or _format_type(_display_text(normalized, "legacy_numeric"))
    score = 0.0

    if format_type:
        score += 1.0
    elif 6 <= len(normalized) <= 9 and re.search(r"[A-Z]", normalized) and re.search(r"\d", normalized):
        score += 0.55
    elif 5 <= len(normalized) <= 10:
        score += 0.25

    if len(normalized) >= 4 and normalized[-4:].isdigit():
        score += 0.2
    if len(normalized) in {6, 7, 8, 9}:
        score += 0.1
    if cleaned and "-" in cleaned:
        score += 0.05

    return round(min(score, 1.5), 4)


def normalize_plate_text(raw_text: str | None) -> dict[str, Any]:
    cleaned = clean_plate_text(raw_text)
    compact = compact_plate_text(cleaned)
    if not compact:
        return {
            "raw": raw_text,
            "cleaned": cleaned,
            "normalized": None,
            "is_valid": False,
            "format_type": None,
            "confidence_adjustment": -0.25,
        }

    normalized = _normalize_numeric_section(compact)
    format_type = _format_type(normalized)

    if format_type == "legacy_numeric":
        normalized = _display_text(normalized, format_type)
    elif len(normalized) == 6 and normalized.isdigit():
        normalized = f"{normalized[:2]}-{normalized[2:]}"
        format_type = "legacy_numeric"

    is_valid = bool(format_type)
    if is_valid:
        confidence_adjustment = 0.15
    elif 6 <= len(normalized) <= 9 and normalized[-4:].isdigit():
        confidence_adjustment = 0.05
    else:
        confidence_adjustment = -0.15

    return {
        "raw": raw_text,
        "cleaned": cleaned,
        "normalized": normalized,
        "is_valid": is_valid,
        "format_type": format_type,
        "confidence_adjustment": confidence_adjustment,
    }


def normalize_sri_lankan_plate(raw_text: str | None) -> PlateNormalizationResult:
    normalized = normalize_plate_text(raw_text)
    normalized_text = normalized["normalized"]
    cleaned = normalized["cleaned"]
    is_valid = bool(normalized["is_valid"])
    if normalized_text is None:
        status = "no_text_detected"
    elif is_valid and normalized_text == compact_plate_text(raw_text):
        status = "valid_sri_lankan_format"
    elif is_valid:
        status = "normalized_sri_lankan_format"
    else:
        status = "invalid_sri_lankan_format"

    return PlateNormalizationResult(
        raw_text=raw_text,
        compact_text=compact_plate_text(raw_text),
        normalized_text=normalized_text,
        display_text=normalized_text or cleaned,
        status=status,
        format_type=normalized["format_type"],
        is_valid=is_valid,
        confidence_adjustment=normalized["confidence_adjustment"],
    )

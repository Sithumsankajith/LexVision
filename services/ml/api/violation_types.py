from __future__ import annotations

from collections.abc import Iterable


SUPPORTED_CLAIMED_VIOLATION_TYPES = {
    "helmet",
    "red_light",
    "white_line",
}

_VIOLATION_TYPE_ALIASES = {
    "helmet": "helmet",
    "nohelmet": "helmet",
    "no-helmet": "helmet",
    "redlight": "red_light",
    "red-light": "red_light",
    "red_light": "red_light",
    "whiteline": "white_line",
    "white-line": "white_line",
    "white_line": "white_line",
}

_STORED_TYPE_VARIANTS = {
    "helmet": {"helmet"},
    "red_light": {"red_light", "red-light"},
    "white_line": {"white_line", "white-line"},
}


def normalize_claimed_violation_type(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = value.strip().lower()
    if not cleaned:
        return None

    normalized_key = cleaned.replace("-", "_")
    return _VIOLATION_TYPE_ALIASES.get(cleaned) or _VIOLATION_TYPE_ALIASES.get(normalized_key)


def is_supported_claimed_violation_type(value: str | None) -> bool:
    normalized = normalize_claimed_violation_type(value)
    return normalized in SUPPORTED_CLAIMED_VIOLATION_TYPES


def violation_type_variants(value: str | None) -> list[str]:
    normalized = normalize_claimed_violation_type(value)
    if normalized is None:
        return []
    return sorted(_STORED_TYPE_VARIANTS.get(normalized, {normalized}))


def canonical_or_original_violation_type(value: str | None) -> str | None:
    normalized = normalize_claimed_violation_type(value)
    return normalized or value


def deduplicate_violation_types(values: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered

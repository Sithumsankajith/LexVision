from __future__ import annotations

from typing import Any


SRI_LANKA_BOUNDS = {
    "north": 9.9,
    "south": 5.9,
    "east": 81.9,
    "west": 79.5,
}

SRI_LANKA_DISTRICTS = [
    "Colombo",
    "Gampaha",
    "Kalutara",
    "Kandy",
    "Matale",
    "Nuwara Eliya",
    "Galle",
    "Matara",
    "Hambantota",
    "Jaffna",
    "Kilinochchi",
    "Mannar",
    "Mullaitivu",
    "Vavuniya",
    "Trincomalee",
    "Batticaloa",
    "Ampara",
    "Kurunegala",
    "Puttalam",
    "Anuradhapura",
    "Polonnaruwa",
    "Badulla",
    "Monaragala",
    "Ratnapura",
    "Kegalle",
]

_DISTRICT_LOOKUP = {district.lower(): district for district in SRI_LANKA_DISTRICTS}


def normalize_district(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = " ".join(value.strip().split())
    if not cleaned:
        return None

    return _DISTRICT_LOOKUP.get(cleaned.lower())


def is_within_sri_lanka_bounds(latitude: float, longitude: float) -> bool:
    return (
        SRI_LANKA_BOUNDS["south"] <= latitude <= SRI_LANKA_BOUNDS["north"]
        and SRI_LANKA_BOUNDS["west"] <= longitude <= SRI_LANKA_BOUNDS["east"]
    )


def district_counts_payload(rows: list[Any]) -> list[dict[str, int | str]]:
    totals = {district: 0 for district in SRI_LANKA_DISTRICTS}
    for row in rows:
        district = normalize_district(getattr(row, "district", None) or row[0])
        if district:
            totals[district] += int(getattr(row, "count", None) or row[1] or 0)
    return [{"district": district, "count": count} for district, count in totals.items() if count > 0]

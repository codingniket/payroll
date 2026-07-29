from __future__ import annotations

import re


def is_weekly_off_status(source_status: object) -> bool:
    value = str(source_status or "").strip().upper()
    compact = re.sub(r"[^A-Z0-9]", "", value)
    return (
        value in {"WO", "WEEKLY OFF"}
        or "WO" in compact
        or "WIO" in compact
        or "W0I" in compact
    )


def normalize_status(source_status: object) -> str:
    value = str(source_status or "").strip().upper()
    if is_weekly_off_status(value):
        return "holiday"
    if value == "A":
        return "absent"
    if value == "MIS" or value.startswith("MIS"):
        return "missing"
    if value == "P" or value.startswith("P/"):
        return "present"
    if value in {"HOLIDAY", "H"}:
        return "holiday"
    return "unknown"


RESOLVED_STATUSES = {"present", "absent", "holiday"}

from __future__ import annotations

import re

TIME_PATTERN = re.compile(r"^(?P<hours>\d{1,3}):(?P<minutes>\d{2})$")


def parse_minutes(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    match = TIME_PATTERN.match(text)
    if not match:
        return None
    minutes = int(match.group("minutes"))
    if minutes > 59:
        return None
    return int(match.group("hours")) * 60 + minutes


def parse_clock_minutes(value: object) -> int | None:
    minutes = parse_minutes(value)
    if minutes is None or minutes >= 24 * 60:
        return None
    return minutes


def format_minutes(value: int | None) -> str:
    if value is None:
        return ""
    sign = "-" if value < 0 else ""
    absolute = abs(value)
    return f"{sign}{absolute // 60}:{absolute % 60:02d}"


def worked_minutes_from_punches(in_time: str | None, out_time: str | None) -> int | None:
    in_minutes = parse_clock_minutes(in_time)
    out_minutes = parse_clock_minutes(out_time)
    if in_minutes is None or out_minutes is None:
        return None
    if out_minutes < in_minutes:
        out_minutes += 24 * 60
    return out_minutes - in_minutes


def out_time_from_worked_minutes(in_time: str | None, worked_minutes: int) -> str | None:
    in_minutes = parse_clock_minutes(in_time)
    if in_minutes is None or worked_minutes < 0:
        return None
    out_minutes = (in_minutes + worked_minutes) % (24 * 60)
    return f"{out_minutes // 60:02d}:{out_minutes % 60:02d}"


def in_time_from_worked_minutes(out_time: str | None, worked_minutes: int) -> str | None:
    out_minutes = parse_clock_minutes(out_time)
    if out_minutes is None or worked_minutes < 0:
        return None
    in_minutes = (out_minutes - worked_minutes) % (24 * 60)
    return f"{in_minutes // 60:02d}:{in_minutes % 60:02d}"

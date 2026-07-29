from __future__ import annotations

import calendar
import re
from datetime import date
from typing import Any

from app.domain.statuses import normalize_status
from app.domain.time_values import parse_minutes

MONTH_PATTERN = re.compile(
    r"(?P<month>January|February|March|April|May|June|July|August|September|October|"
    r"November|December)\s*[- ]\s*(?P<year>20\d{2})",
    re.IGNORECASE,
)
CODE_PATTERN = re.compile(r"Emp\s*Code\s*:\s*(?P<value>.+)", re.IGNORECASE)
NAME_PATTERN = re.compile(r"Emp\s*Name\s*:\s*(?P<value>.+)", re.IGNORECASE)


class RegisterParseError(ValueError):
    pass


def _text(value: object) -> str:
    return "" if value is None else str(value).strip()


def _find_month(rows: list[list[Any]]) -> tuple[int, int]:
    for row in rows:
        for value in row:
            match = MONTH_PATTERN.search(_text(value))
            if match:
                month_number = list(calendar.month_name).index(match.group("month").title())
                return int(match.group("year")), month_number
    raise RegisterParseError("The payroll month could not be found in the register title.")


def _row_text(row: list[Any]) -> str:
    return " | ".join(_text(value) for value in row if _text(value))


def _find_value(pattern: re.Pattern, row: list[Any]) -> str | None:
    for value in row:
        match = pattern.search(_text(value))
        if match:
            return match.group("value").strip()
    return None


def _parse_daily_cell(value: object) -> dict[str, Any]:
    lines = str(value or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines += [""] * (8 - len(lines))
    shift_label, in_time, out_time, late, early, source_ot, worked, source_status = lines[:8]
    in_time = in_time.strip() or None
    out_time = out_time.strip() or None
    return {
        "shiftLabel": shift_label.strip(),
        "inTime": in_time,
        "outTime": out_time,
        "lateMinutesFromSource": int(late.strip()) if late.strip().isdigit() else 0,
        "earlyDepartureMinutesFromSource": int(early.strip()) if early.strip().isdigit() else 0,
        "sourceOtMinutes": parse_minutes(source_ot),
        "workedMinutes": parse_minutes(worked),
        "sourceStatus": source_status.strip(),
        "status": normalize_status(source_status),
        "suspiciousConfirmed": False,
        "hoursOverridden": False,
        "issues": [],
    }


def parse_register_rows(rows: list[list[Any]]) -> dict[str, Any]:
    if not rows:
        raise RegisterParseError("The attendance file is empty.")
    width = max((len(row) for row in rows), default=0)
    normalized_rows = [list(row) + [None] * (width - len(row)) for row in rows]
    year, month_number = _find_month(normalized_rows)
    month = f"{year:04d}-{month_number:02d}"
    employee_anchors = [
        index
        for index, row in enumerate(normalized_rows)
        if any(CODE_PATTERN.search(_text(value)) for value in row)
    ]
    if not employee_anchors:
        raise RegisterParseError("No employee register was found in the attendance file.")

    employees: list[dict[str, Any]] = []
    for anchor_index, header_row_index in enumerate(employee_anchors):
        block_end = (
            employee_anchors[anchor_index + 1]
            if anchor_index + 1 < len(employee_anchors)
            else len(normalized_rows)
        )
        header_row = normalized_rows[header_row_index]
        employee_code = _find_value(CODE_PATTERN, header_row)
        employee_name = _find_value(NAME_PATTERN, header_row)
        if not employee_code or not employee_name:
            raise RegisterParseError("An employee block is missing its code or name.")

        date_row_index = None
        date_columns: list[tuple[int, int]] = []
        for candidate_index in range(header_row_index + 1, min(block_end, header_row_index + 12)):
            candidate_columns: list[tuple[int, int]] = []
            for column_index, value in enumerate(normalized_rows[candidate_index]):
                text = _text(value)
                if text.isdigit() and 1 <= int(text) <= 31:
                    candidate_columns.append((column_index, int(text)))
            if len(candidate_columns) >= 20:
                date_row_index = candidate_index
                date_columns = candidate_columns
                break
        if date_row_index is None or date_row_index + 2 >= len(normalized_rows):
            raise RegisterParseError(
                f"Daily attendance columns were not found for employee {employee_code}."
            )

        weekday_row = normalized_rows[date_row_index + 1]
        details_row = normalized_rows[date_row_index + 2]
        days: list[dict[str, Any]] = []
        for column_index, day_number in date_columns:
            if day_number > calendar.monthrange(year, month_number)[1]:
                continue
            daily = _parse_daily_cell(details_row[column_index])
            daily.update(
                {
                    "date": date(year, month_number, day_number).isoformat(),
                    "day": day_number,
                    "weekday": _text(weekday_row[column_index]),
                }
            )
            days.append(daily)

        employees.append(
            {
                "employeeCode": employee_code,
                "employeeName": employee_name,
                "sourceSummary": _row_text(header_row),
                "days": days,
                "daysInMonth": calendar.monthrange(year, month_number)[1],
                "matched": False,
                "salary": 0,
                "shiftHours": 0,
                "advance": 0,
                "baseOverrides": {},
                "overtimeOverrides": {},
            }
        )
    return {"month": month, "employees": employees}

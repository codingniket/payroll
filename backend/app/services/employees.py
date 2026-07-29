from __future__ import annotations

import re
from typing import Any


def normalize_name(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _employee_value(employee: dict[str, Any], *keys: str) -> Any:
    lowercase_values = {str(key).casefold(): value for key, value in employee.items()}
    for key in keys:
        if key.casefold() in lowercase_values:
            return lowercase_values[key.casefold()]
    return None


def match_employees(parsed_employees: list[dict[str, Any]], master: list[dict[str, Any]]) -> None:
    master_by_code = {
        str(_employee_value(item, "employee_code", "employeeCode", "code") or "").strip(): item
        for item in master
    }
    for employee in parsed_employees:
        record = master_by_code.get(str(employee["employeeCode"]).strip())
        matched = bool(
            record
            and normalize_name(_employee_value(record, "name", "employee_name", "employeeName"))
            == normalize_name(employee["employeeName"])
        )
        employee["matched"] = matched
        if matched and record:
            employee["employeeName"] = str(
                _employee_value(record, "name", "employee_name", "employeeName")
            ).strip()
            employee["salary"] = _employee_value(record, "salary")
            employee["shiftHours"] = _employee_value(record, "shift_hours", "shiftHours")

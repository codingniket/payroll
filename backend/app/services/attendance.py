from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.domain.time_values import in_time_from_worked_minutes, out_time_from_worked_minutes


def apply_default_shift_to_present_days(employee: dict[str, Any]) -> int:
    """Make every punched day present and apply the configured shift duration."""
    shift_minutes = int(Decimal(str(employee["shiftHours"])) * 60)
    updated_days = 0
    for day in employee.get("days", []):
        in_time = day.get("inTime")
        out_time = day.get("outTime")
        if not in_time and not out_time:
            continue
        day["status"] = "present"
        day["workedMinutes"] = shift_minutes
        day["hoursOverridden"] = True
        day["defaultShiftApplied"] = True
        if in_time:
            day["outTime"] = out_time_from_worked_minutes(in_time, shift_minutes)
        elif out_time:
            day["inTime"] = in_time_from_worked_minutes(out_time, shift_minutes)
        updated_days += 1
    return updated_days

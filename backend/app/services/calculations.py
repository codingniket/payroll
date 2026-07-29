from __future__ import annotations

import calendar
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

OT_DIVISORS = {8: 6, 10: 6, 12: 5}


def round_rupees(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _decimal(value: object, default: Decimal = Decimal("0")) -> Decimal:
    if value is None or value == "":
        return default
    return Decimal(str(value))


def _override(overrides: dict[str, Any], key: str, default: Any) -> Any:
    value = overrides.get(key)
    return default if value is None else value


def is_holiday(day: dict[str, Any], manual_holiday_dates: set[str]) -> bool:
    return day["date"] in manual_holiday_dates or str(day.get("weekday", "")).lower().startswith(
        "su"
    )


def calculate_base_payroll(
    employee: dict[str, Any],
    month: str,
    manual_holiday_dates: list[str],
) -> dict[str, Any]:
    overrides = employee.get("baseOverrides", {})
    year, month_number = (int(part) for part in month.split("-"))
    days_in_month = calendar.monthrange(year, month_number)[1]
    holiday_dates = set(manual_holiday_dates)

    shift_hours = _decimal(_override(overrides, "shiftHours", employee["shiftHours"]))
    shift_minutes = int(shift_hours * 60)
    salary = _decimal(_override(overrides, "salary", employee["salary"]))
    calculated_per_day = salary / Decimal(days_in_month)
    per_day = _decimal(_override(overrides, "perDay", calculated_per_day))

    calculated_absent = sum(
        1
        for day in employee["days"]
        if day.get("status") == "absent" and not is_holiday(day, holiday_dates)
    )
    total_absent = int(_override(overrides, "totalAbsent", calculated_absent))
    calculated_holidays = sum(1 for day in employee["days"] if is_holiday(day, holiday_dates))
    holiday_count = int(_override(overrides, "holiday", calculated_holidays))
    calculated_present = sum(
        1
        for day in employee["days"]
        if day.get("status") == "present" and not is_holiday(day, holiday_dates)
    )
    total_present = int(_override(overrides, "totalPresent", calculated_present))

    calculated_actual_minutes = sum(int(day.get("workedMinutes") or 0) for day in employee["days"])
    actual_minutes = int(
        _override(overrides, "actualHoursWorkedMinutes", calculated_actual_minutes)
    )
    calculated_late_minutes = sum(
        max(0, shift_minutes - int(day.get("workedMinutes") or 0))
        for day in employee["days"]
        if day.get("status") == "present" and not is_holiday(day, holiday_dates)
    )
    late_minutes = int(_override(overrides, "lateTimeMinutes", calculated_late_minutes))
    total_hours_minutes = int(
        _override(overrides, "totalHoursMinutes", total_present * shift_minutes)
    )

    calculated_absent_deduction = Decimal(total_absent) * per_day
    absent_deduction = _decimal(
        _override(overrides, "absentDeduction", calculated_absent_deduction)
    )
    calculated_late_fine = (
        Decimal(late_minutes) / Decimal(shift_minutes) * per_day if shift_minutes else Decimal("0")
    )
    late_fine = _decimal(_override(overrides, "lateFine", calculated_late_fine))
    advance = _decimal(_override(overrides, "advance", employee.get("advance", 0)))
    calculated_deduction = absent_deduction + late_fine
    deduction = _decimal(_override(overrides, "deduction", calculated_deduction))
    calculated_net = salary - deduction - advance
    net_amount = _decimal(_override(overrides, "netAmount", calculated_net))

    return {
        "employeeCode": employee["employeeCode"],
        "employeeName": employee["employeeName"],
        "shiftHours": float(shift_hours),
        "salary": round_rupees(salary),
        "perDay": round_rupees(per_day),
        "totalAbsent": total_absent,
        "holiday": holiday_count,
        "totalPresent": total_present,
        "absentDeduction": round_rupees(absent_deduction),
        "totalHoursMinutes": total_hours_minutes,
        "actualHoursWorkedMinutes": actual_minutes,
        "advance": round_rupees(advance),
        "lateTimeMinutes": late_minutes,
        "lateFine": round_rupees(late_fine),
        "deduction": round_rupees(deduction),
        "netAmount": round_rupees(net_amount),
        "overriddenFields": sorted(overrides.keys()),
    }


def calculate_overtime_payroll(
    employee: dict[str, Any],
    base_result: dict[str, Any],
) -> dict[str, Any]:
    overrides = employee.get("overtimeOverrides", {})
    shift_hours = _decimal(_override(overrides, "shiftHours", base_result["shiftHours"]))
    divisor = OT_DIVISORS.get(int(shift_hours)) if shift_hours == int(shift_hours) else None
    if divisor is None:
        raise ValueError(f"No overtime divisor is configured for a {shift_hours:g}-hour shift.")

    shift_minutes = int(shift_hours * 60)
    calculated_overtime_minutes = 0
    for day in employee["days"]:
        worked_minutes = day.get("workedMinutes")
        if worked_minutes is None or day.get("status") not in {"present", "holiday"}:
            continue
        excess = int(worked_minutes) - shift_minutes
        if excess > 15:
            calculated_overtime_minutes += excess

    new_salary = _decimal(_override(overrides, "newSalary", base_result["salary"]))
    total_absent = int(_override(overrides, "totalAbsent", base_result["totalAbsent"]))
    holiday = int(_override(overrides, "holiday", base_result["holiday"]))
    total_present = int(_override(overrides, "totalPresent", base_result["totalPresent"]))
    total_hours_minutes = int(
        _override(overrides, "totalHoursMinutes", total_present * shift_minutes)
    )
    actual_minutes = int(
        _override(
            overrides,
            "actualHoursWorkedMinutes",
            base_result["actualHoursWorkedMinutes"],
        )
    )
    calculated_per_day = new_salary / Decimal(employee["daysInMonth"])
    per_day = _decimal(_override(overrides, "perDay", calculated_per_day))
    overtime_minutes = int(
        _override(overrides, "overtimeHoursMinutes", calculated_overtime_minutes)
    )
    overtime_divisor = _decimal(_override(overrides, "overtimeShiftDivisor", divisor))
    calculated_overtime_total = (
        Decimal(overtime_minutes) / Decimal(60) / overtime_divisor * per_day
        if overtime_divisor
        else Decimal("0")
    )
    overtime_total = _decimal(
        _override(overrides, "overtimeTotal", calculated_overtime_total)
    )
    calculated_tiffin = Decimal(total_present * 10) if shift_hours > 8 else Decimal("0")
    tiffin = _decimal(_override(overrides, "tiffin", calculated_tiffin))
    net_amount_ot = _decimal(_override(overrides, "netAmountOt", overtime_total + tiffin))
    return {
        "employeeCode": employee["employeeCode"],
        "employeeName": employee["employeeName"],
        "shiftHours": float(shift_hours),
        "newSalary": round_rupees(new_salary),
        "totalAbsent": total_absent,
        "holiday": holiday,
        "totalPresent": total_present,
        "totalHoursMinutes": total_hours_minutes,
        "perDay": round_rupees(per_day),
        "actualHoursWorkedMinutes": actual_minutes,
        "overtimeHoursMinutes": overtime_minutes,
        "overtimeShiftDivisor": float(overtime_divisor),
        "overtimeTotal": round_rupees(overtime_total),
        "tiffin": round_rupees(tiffin),
        "netAmountOt": round_rupees(net_amount_ot),
        "overriddenFields": sorted(overrides.keys()),
    }

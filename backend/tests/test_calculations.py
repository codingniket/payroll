from app.services.calculations import calculate_base_payroll, calculate_overtime_payroll


def employee_fixture(shift_hours=8, salary=30_000):
    days = []
    for day in range(1, 31):
        weekday = "Su" if day in {7, 14, 21, 28} else "Mo"
        days.append(
            {
                "date": f"2026-06-{day:02d}",
                "weekday": weekday,
                "status": "present",
                "workedMinutes": shift_hours * 60,
            }
        )
    return {
        "employeeCode": "4",
        "employeeName": "Employee",
        "salary": salary,
        "shiftHours": shift_hours,
        "advance": 500,
        "daysInMonth": 30,
        "days": days,
        "baseOverrides": {},
    }


def test_base_payroll_uses_holidays_and_present_day_late_fine_only():
    employee = employee_fixture()
    employee["days"][0]["workedMinutes"] = 360
    employee["days"][1]["status"] = "absent"
    employee["days"][1]["workedMinutes"] = 0
    result = calculate_base_payroll(employee, "2026-06", ["2026-06-10"])
    assert result["holiday"] == 5
    assert result["totalAbsent"] == 1
    assert result["totalPresent"] == 24
    assert result["lateTimeMinutes"] == 120
    assert result["absentDeduction"] == 1000
    assert result["lateFine"] == 250
    assert result["netAmount"] == 28_250


def test_overtime_requires_more_than_fifteen_minutes():
    employee = employee_fixture()
    employee["days"][0]["workedMinutes"] = 8 * 60 + 15
    employee["days"][1]["workedMinutes"] = 8 * 60 + 16
    base = calculate_base_payroll(employee, "2026-06", [])
    overtime = calculate_overtime_payroll(employee, base)
    assert overtime["overtimeHoursMinutes"] == 16
    assert overtime["overtimeShiftDivisor"] == 6


def test_tiffin_applies_only_above_eight_hour_shift():
    employee = employee_fixture(shift_hours=10)
    employee["days"][0]["status"] = "absent"
    base = calculate_base_payroll(employee, "2026-06", [])
    overtime = calculate_overtime_payroll(employee, base)
    assert overtime["totalPresent"] == 25
    assert overtime["tiffin"] == 250

    eight_hour_employee = employee_fixture(shift_hours=8)
    eight_hour_base = calculate_base_payroll(eight_hour_employee, "2026-06", [])
    eight_hour_overtime = calculate_overtime_payroll(eight_hour_employee, eight_hour_base)
    assert eight_hour_overtime["tiffin"] == 0


def test_base_override_cascades_and_is_identified():
    employee = employee_fixture()
    employee["baseOverrides"] = {"salary": 36_000, "advance": 1_000}
    result = calculate_base_payroll(employee, "2026-06", [])
    assert result["salary"] == 36_000
    assert result["perDay"] == 1_200
    assert result["netAmount"] == 35_000
    assert result["overriddenFields"] == ["advance", "salary"]


def test_deduction_override_recalculates_net_salary():
    employee = employee_fixture()
    employee["days"][0]["status"] = "absent"
    employee["days"][0]["workedMinutes"] = 0
    employee["baseOverrides"] = {"deduction": 0}
    result = calculate_base_payroll(employee, "2026-06", [])
    assert result["deduction"] == 0
    assert result["netAmount"] == 29_500


def test_overtime_override_recalculates_net_overtime():
    employee = employee_fixture(shift_hours=10)
    employee["days"][0]["status"] = "absent"
    employee["days"][0]["workedMinutes"] = 0
    base = calculate_base_payroll(employee, "2026-06", [])
    employee["overtimeOverrides"] = {"overtimeTotal": 7000, "tiffin": 0}
    overtime = calculate_overtime_payroll(employee, base)
    assert overtime["overtimeTotal"] == 7000
    assert overtime["tiffin"] == 0
    assert overtime["netAmountOt"] == 7000
    assert overtime["overriddenFields"] == ["overtimeTotal", "tiffin"]


def test_base_actual_hours_are_carried_to_overtime():
    employee = employee_fixture()
    employee["baseOverrides"] = {"actualHoursWorkedMinutes": 12_345}
    base = calculate_base_payroll(employee, "2026-06", [])
    overtime = calculate_overtime_payroll(employee, base)
    assert base["actualHoursWorkedMinutes"] == 12_345
    assert overtime["actualHoursWorkedMinutes"] == 12_345

from __future__ import annotations

from typing import Any

from app.domain.statuses import RESOLVED_STATUSES
from app.domain.time_values import parse_clock_minutes


def day_issues(day: dict[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    status = day.get("status")
    if status not in RESOLVED_STATUSES:
        issues.append(
            {"code": "unresolved_status", "message": "Choose Present, Absent, or Holiday."}
        )
        return issues

    if status != "present":
        return issues

    if not day.get("inTime") or not day.get("outTime"):
        issues.append({"code": "missing_punch", "message": "Add both in and out times."})
    if day.get("workedMinutes") is None:
        issues.append({"code": "missing_hours", "message": "Add the hours worked."})

    suspicious = False
    for value in (day.get("inTime"), day.get("outTime")):
        minutes = parse_clock_minutes(value)
        if minutes is not None and minutes < 4 * 60:
            suspicious = True
    if suspicious and not day.get("suspiciousConfirmed"):
        issues.append({"code": "suspicious_time", "message": "Confirm the early-morning time."})
    return issues


def refresh_job_issues(job: dict[str, Any]) -> list[dict[str, Any]]:
    unresolved: list[dict[str, Any]] = []
    manual_holiday_dates = set(job.get("manualHolidayDates", []))
    for employee in job.get("employees", []):
        if not employee.get("matched"):
            unresolved.append(
                {
                    "employeeCode": employee["employeeCode"],
                    "date": None,
                    "code": "employee_mismatch",
                    "message": "Employee code and name do not match the employee list.",
                }
            )
        for day in employee.get("days", []):
            is_calendar_holiday = (
                day.get("date") in manual_holiday_dates
                or str(day.get("weekday", "")).strip().lower().startswith("su")
            )
            if is_calendar_holiday:
                day["automaticHoliday"] = True
                # Attendance registers sometimes shift a neighbouring value into an
                # otherwise empty weekly-off row. Keep Sunday/holiday attendance only
                # when it contains a complete, positive work interval.
                if not day.get("holidayAttendanceSanitized"):
                    has_complete_work = bool(
                        day.get("inTime")
                        and day.get("outTime")
                        and int(day.get("workedMinutes") or 0) > 0
                    )
                    if not has_complete_work:
                        day["inTime"] = None
                        day["outTime"] = None
                        day["workedMinutes"] = 0
                        day["hoursOverridden"] = False
                    day["holidayAttendanceSanitized"] = True
                defaulted_worked_holiday = bool(
                    day.get("defaultShiftApplied")
                    and day.get("inTime")
                    and day.get("outTime")
                    and int(day.get("workedMinutes") or 0) > 0
                )
                day["status"] = "present" if defaulted_worked_holiday else "holiday"
            day["issues"] = day_issues(day)
            for issue in day["issues"]:
                unresolved.append(
                    {
                        "employeeCode": employee["employeeCode"],
                        "date": day["date"],
                        **issue,
                    }
                )
    job["unresolvedAttendanceIssues"] = unresolved
    return unresolved

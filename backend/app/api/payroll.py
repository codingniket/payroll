from __future__ import annotations

import json
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_file

from app.domain.time_values import worked_minutes_from_punches
from app.parsers import parse_attendance_file
from app.parsers.register import RegisterParseError
from app.repositories.json_store import JsonStore
from app.services.attendance import apply_default_shift_to_present_days
from app.services.calculations import calculate_base_payroll, calculate_overtime_payroll
from app.services.employees import match_employees
from app.services.exports import export_base_payroll, export_overtime_payroll
from app.services.validation import refresh_job_issues

payroll_api = Blueprint("payroll", __name__)
logger = logging.getLogger(__name__)


def _store() -> JsonStore:
    return JsonStore(Path(current_app.config["DATA_DIRECTORY"]))


def _current_job() -> dict:
    job = _store().load_job()
    if not job:
        raise LookupError("No payroll is in progress.")
    return job


def _error(message: str, status: int, issues: list | None = None):
    payload = {"message": message}
    if issues is not None:
        payload["issues"] = issues
    return jsonify(payload), status


@payroll_api.before_request
def handle_options():
    if request.method == "OPTIONS":
        return "", 204
    return None


@payroll_api.get("/current")
def get_current_job():
    try:
        job = _current_job()
        store = _store()
        match_employees(job["employees"], store.load_employee_master())
        refresh_job_issues(job)
        store.save_job(job)
        return jsonify(job)
    except LookupError as error:
        return _error(str(error), 404)


@payroll_api.post("/upload")
def upload_attendance():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return _error("Choose an attendance file.", 400)
    suffix = Path(uploaded_file.filename).suffix.lower()
    if suffix not in {".xls", ".xlsx", ".pdf"}:
        return _error("Upload an XLS, XLSX, or PDF attendance file.", 400)

    try:
        holiday_value = request.form.get("manualHolidayDates", "[]")
        manual_holiday_dates = json.loads(holiday_value)
        if not isinstance(manual_holiday_dates, list):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        return _error("Holiday dates are invalid.", 400)

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            uploaded_file.save(temporary_file)
            temporary_path = Path(temporary_file.name)
        parsed = parse_attendance_file(temporary_path)
    except RegisterParseError as error:
        return _error(str(error), 422)
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)

    store = _store()
    match_employees(parsed["employees"], store.load_employee_master())
    job = {
        "jobId": str(uuid4()),
        "month": parsed["month"],
        "sourceFileName": Path(uploaded_file.filename).name,
        "manualHolidayDates": sorted(set(manual_holiday_dates)),
        "employees": parsed["employees"],
        "basePayroll": [],
        "overtimePayroll": [],
    }
    refresh_job_issues(job)
    store.save_job(job)
    logger.info("Imported payroll month %s with %d employees", job["month"], len(job["employees"]))
    return jsonify(job), 201


@payroll_api.patch("/current/attendance")
def update_attendance():
    payload = request.get_json(silent=True) or {}
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)

    employee = next(
        (
            item
            for item in job["employees"]
            if item["employeeCode"] == str(payload.get("employeeCode", ""))
        ),
        None,
    )
    if not employee:
        return _error("Employee was not found.", 404)
    day = next((item for item in employee["days"] if item["date"] == payload.get("date")), None)
    if not day:
        return _error("Attendance date was not found.", 404)

    allowed_fields = {"inTime", "outTime", "workedMinutes", "status", "suspiciousConfirmed"}
    changed_fields = allowed_fields.intersection(payload)
    for field in changed_fields:
        day[field] = payload[field]
    if "workedMinutes" in changed_fields:
        day["hoursOverridden"] = True
    elif {"inTime", "outTime"}.intersection(changed_fields):
        day["workedMinutes"] = worked_minutes_from_punches(day.get("inTime"), day.get("outTime"))
        day["hoursOverridden"] = False

    job["basePayroll"] = []
    job["overtimePayroll"] = []
    refresh_job_issues(job)
    _store().save_job(job)
    return jsonify(job)


@payroll_api.patch("/current/attendance/default-shift")
def apply_default_shift():
    payload = request.get_json(silent=True) or {}
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    employee = next(
        (
            item
            for item in job["employees"]
            if item["employeeCode"] == str(payload.get("employeeCode", ""))
        ),
        None,
    )
    if not employee:
        return _error("Employee was not found.", 404)

    apply_default_shift_to_present_days(employee)
    job["basePayroll"] = []
    job["overtimePayroll"] = []
    refresh_job_issues(job)
    _store().save_job(job)
    return jsonify(job)


@payroll_api.post("/current/base/calculate")
def calculate_base():
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    issues = refresh_job_issues(job)
    if issues:
        _store().save_job(job)
        return _error("Resolve the highlighted attendance before calculating payroll.", 422, issues)

    job["basePayroll"] = [
        calculate_base_payroll(employee, job["month"], job["manualHolidayDates"])
        for employee in job["employees"]
    ]
    job["overtimePayroll"] = []
    _store().save_job(job)
    return jsonify(job)


@payroll_api.patch("/current/base/<employee_code>")
def update_base(employee_code: str):
    payload = request.get_json(silent=True) or {}
    overrides = payload.get("overrides")
    if not isinstance(overrides, dict):
        return _error("Payroll changes are invalid.", 400)
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    employee = next(
        (item for item in job["employees"] if item["employeeCode"] == employee_code), None
    )
    if not employee:
        return _error("Employee was not found.", 404)

    allowed = {
        "shiftHours",
        "salary",
        "perDay",
        "totalAbsent",
        "holiday",
        "totalPresent",
        "absentDeduction",
        "totalHoursMinutes",
        "actualHoursWorkedMinutes",
        "advance",
        "lateTimeMinutes",
        "lateFine",
        "deduction",
        "netAmount",
    }
    employee["baseOverrides"] = {key: value for key, value in overrides.items() if key in allowed}
    # Shared values originate in base payroll. Remove stale overtime-side
    # overrides so the latest base edits are carried into the next OT result.
    overtime_overrides = employee.get("overtimeOverrides", {})
    base_linked_overtime_fields = {
        "shiftHours",
        "newSalary",
        "totalAbsent",
        "holiday",
        "totalPresent",
        "totalHoursMinutes",
        "perDay",
        "actualHoursWorkedMinutes",
    }
    employee["overtimeOverrides"] = {
        key: value
        for key, value in overtime_overrides.items()
        if key not in base_linked_overtime_fields
    }
    job["basePayroll"] = [
        calculate_base_payroll(item, job["month"], job["manualHolidayDates"])
        for item in job["employees"]
    ]
    job["overtimePayroll"] = []
    _store().save_job(job)
    return jsonify(job)


@payroll_api.post("/current/overtime/calculate")
def calculate_overtime():
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    if not job.get("basePayroll"):
        return _error("Calculate base payroll first.", 409)
    base_by_code = {result["employeeCode"]: result for result in job["basePayroll"]}
    try:
        job["overtimePayroll"] = [
            calculate_overtime_payroll(employee, base_by_code[employee["employeeCode"]])
            for employee in job["employees"]
        ]
    except ValueError as error:
        return _error(str(error), 422)
    _store().save_job(job)
    return jsonify(job)


@payroll_api.patch("/current/overtime/<employee_code>")
def update_overtime(employee_code: str):
    payload = request.get_json(silent=True) or {}
    overrides = payload.get("overrides")
    if not isinstance(overrides, dict):
        return _error("Overtime changes are invalid.", 400)
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    if not job.get("basePayroll"):
        return _error("Calculate base payroll first.", 409)
    employee = next(
        (item for item in job["employees"] if item["employeeCode"] == employee_code), None
    )
    if not employee:
        return _error("Employee was not found.", 404)

    allowed = {
        "shiftHours",
        "newSalary",
        "totalAbsent",
        "holiday",
        "totalPresent",
        "totalHoursMinutes",
        "perDay",
        "actualHoursWorkedMinutes",
        "overtimeHoursMinutes",
        "overtimeShiftDivisor",
        "overtimeTotal",
        "tiffin",
        "netAmountOt",
    }
    employee["overtimeOverrides"] = {
        key: value for key, value in overrides.items() if key in allowed
    }
    base_by_code = {result["employeeCode"]: result for result in job["basePayroll"]}
    try:
        job["overtimePayroll"] = [
            calculate_overtime_payroll(item, base_by_code[item["employeeCode"]])
            for item in job["employees"]
        ]
    except ValueError as error:
        return _error(str(error), 422)
    _store().save_job(job)
    return jsonify(job)


@payroll_api.get("/current/export/base")
def export_base():
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    if not job.get("basePayroll"):
        return _error("Calculate base payroll before downloading it.", 409)
    workbook = export_base_payroll(job["basePayroll"])
    return send_file(
        workbook, as_attachment=True, download_name=f"base-payroll-{job['month']}.xlsx"
    )


@payroll_api.get("/current/export/overtime")
def export_overtime():
    try:
        job = _current_job()
    except LookupError as error:
        return _error(str(error), 404)
    if not job.get("overtimePayroll"):
        return _error("Calculate overtime payroll before downloading it.", 409)
    workbook = export_overtime_payroll(job["overtimePayroll"])
    return send_file(
        workbook, as_attachment=True, download_name=f"overtime-payroll-{job['month']}.xlsx"
    )


@payroll_api.post("/current/exit")
def exit_payroll():
    _store().clear_job()
    return "", 204

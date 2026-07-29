from openpyxl import load_workbook

from app.repositories.json_store import JsonStore
from app.services.exports import export_base_payroll


def test_json_store_replaces_and_clears_current_job(tmp_path):
    store = JsonStore(tmp_path)
    store.save_job({"month": "2026-06"})
    assert store.load_job() == {"month": "2026-06"}
    store.save_job({"month": "2026-07"})
    assert store.load_job() == {"month": "2026-07"}
    store.clear_job()
    assert store.load_job() is None


def test_base_export_has_frozen_headers_filters_and_override_marker():
    result = {
        "employeeCode": "4",
        "employeeName": "Employee",
        "shiftHours": 8,
        "salary": 30_000,
        "perDay": 1_000,
        "totalAbsent": 1,
        "holiday": 4,
        "totalPresent": 25,
        "absentDeduction": 1_000,
        "totalHoursMinutes": 12_000,
        "actualHoursWorkedMinutes": 11_700,
        "advance": 500,
        "lateTimeMinutes": 300,
        "lateFine": 625,
        "deduction": 1_625,
        "netAmount": 27_875,
        "overriddenFields": ["advance"],
    }
    workbook = load_workbook(export_base_payroll([result]))
    sheet = workbook["Base Payroll"]
    assert sheet.freeze_panes == "C2"
    assert sheet.auto_filter.ref == "A1:P2"
    assert sheet["L2"].fill.fgColor.rgb.endswith("FFF3D6")

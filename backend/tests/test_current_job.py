import json

from app import create_app


def test_current_job_is_rematched_after_employee_master_changes(tmp_path):
    (tmp_path / "employee.json").write_text(
        json.dumps(
            {
                "employees": [
                    {
                        "employee_code": "4",
                        "name": "asit acharya",
                        "salary": 30_000,
                        "shift_hours": 8,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "data.json").write_text(
        json.dumps(
            {
                "month": "2026-06",
                "manualHolidayDates": [],
                "employees": [
                    {
                        "employeeCode": "4",
                        "employeeName": "asit acharya",
                        "matched": False,
                        "salary": 0,
                        "shiftHours": 0,
                        "days": [],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    app = create_app({"TESTING": True, "DATA_DIRECTORY": tmp_path})

    response = app.test_client().get("/api/payroll/current")

    assert response.status_code == 200
    assert response.json["employees"][0]["matched"] is True
    assert response.json["employees"][0]["salary"] == 30_000
    assert response.json["unresolvedAttendanceIssues"] == []

from app.services.validation import day_issues, refresh_job_issues


def test_missing_punch_blocks_present_day():
    issues = day_issues(
        {
            "status": "present",
            "inTime": "06:00",
            "outTime": None,
            "workedMinutes": None,
            "suspiciousConfirmed": False,
        }
    )
    assert {issue["code"] for issue in issues} == {"missing_punch", "missing_hours"}


def test_midnight_time_requires_confirmation():
    day = {
        "status": "present",
        "inTime": "00:09",
        "outTime": "08:09",
        "workedMinutes": 480,
        "suspiciousConfirmed": False,
    }
    assert [issue["code"] for issue in day_issues(day)] == ["suspicious_time"]
    day["suspiciousConfirmed"] = True
    assert day_issues(day) == []


def test_sunday_is_automatically_resolved_as_holiday():
    job = {
        "manualHolidayDates": [],
        "employees": [
            {
                "employeeCode": "4",
                "matched": True,
                "days": [
                    {
                        "date": "2026-06-21",
                        "weekday": "Su",
                        "status": "missing",
                        "inTime": "22:13",
                        "outTime": None,
                        "workedMinutes": 0,
                        "suspiciousConfirmed": False,
                    }
                ],
            }
        ],
    }
    assert refresh_job_issues(job) == []
    day = job["employees"][0]["days"][0]
    assert day["status"] == "holiday"
    assert day["inTime"] is None
    assert day["outTime"] is None
    assert day["workedMinutes"] == 0


def test_sunday_with_complete_work_is_preserved():
    day = {
        "date": "2026-06-14",
        "weekday": "Su",
        "status": "missing",
        "inTime": "10:00",
        "outTime": "18:00",
        "workedMinutes": 480,
        "suspiciousConfirmed": False,
    }
    job = {
        "manualHolidayDates": [],
        "employees": [{"employeeCode": "4", "matched": True, "days": [day]}],
    }
    assert refresh_job_issues(job) == []
    assert day["status"] == "holiday"
    assert day["inTime"] == "10:00"
    assert day["outTime"] == "18:00"
    assert day["workedMinutes"] == 480


def test_defaulted_sunday_work_remains_present():
    day = {
        "date": "2026-06-14",
        "weekday": "Su",
        "status": "present",
        "inTime": "10:00",
        "outTime": "18:00",
        "workedMinutes": 480,
        "defaultShiftApplied": True,
        "suspiciousConfirmed": False,
    }
    job = {
        "manualHolidayDates": [],
        "employees": [{"employeeCode": "4", "matched": True, "days": [day]}],
    }
    assert refresh_job_issues(job) == []
    assert day["status"] == "present"

from app.services.attendance import apply_default_shift_to_present_days


def test_default_shift_updates_punched_days_and_fills_missing_punches():
    employee = {
        "shiftHours": 8,
        "days": [
            {"status": "present", "inTime": "07:00", "outTime": "17:00", "workedMinutes": 600},
            {"status": "present", "inTime": "22:00", "outTime": "00:00", "workedMinutes": 120},
            {"status": "absent", "inTime": None, "outTime": "18:00", "workedMinutes": 0},
            {"status": "holiday", "inTime": None, "outTime": None, "workedMinutes": 0},
        ],
    }

    assert apply_default_shift_to_present_days(employee) == 3
    assert employee["days"][0]["workedMinutes"] == 480
    assert employee["days"][0]["outTime"] == "15:00"
    assert employee["days"][1]["workedMinutes"] == 480
    assert employee["days"][1]["outTime"] == "06:00"
    assert employee["days"][2]["status"] == "present"
    assert employee["days"][2]["workedMinutes"] == 480
    assert employee["days"][2]["inTime"] == "10:00"
    assert employee["days"][3]["status"] == "holiday"
    assert employee["days"][3]["workedMinutes"] == 0

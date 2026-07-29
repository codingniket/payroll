from app.services.employees import match_employees


def _parsed_employee():
    return {
        "employeeCode": "4",
        "employeeName": "Example Employee",
        "matched": False,
        "salary": 0,
        "shiftHours": 0,
    }


def test_lowercase_snake_case_employee_master_is_default():
    parsed = [_parsed_employee()]
    master = [
        {
            "employee_code": "4",
            "name": "example employee",
            "salary": 30_000,
            "shift_hours": 8,
        }
    ]

    match_employees(parsed, master)

    assert parsed[0]["matched"] is True
    assert parsed[0]["salary"] == 30_000
    assert parsed[0]["shiftHours"] == 8


def test_existing_camel_case_employee_master_remains_supported():
    parsed = [_parsed_employee()]
    master = [
        {
            "employeeCode": "4",
            "name": "Example Employee",
            "salary": 30_000,
            "shiftHours": 8,
        }
    ]

    match_employees(parsed, master)

    assert parsed[0]["matched"] is True

from app.parsers.register import parse_register_rows


def build_register_rows():
    dates = [None, *range(1, 31)]
    weekdays = [None, *("Su" if day in {7, 14, 21, 28} else "Mo" for day in range(1, 31))]
    details = ["Shift\nIn Time\nOut Time\nLate Mins\nEarly Dep\nOT Hrs\nWork Hrs\nStatus"]
    for day in range(1, 31):
        if day == 8:
            details.append("Gene\n06:51\n\n0\n699\n0:00\n0:00\nMIS")
        elif day == 7:
            details.append("Gene\n08:24\n22:17\n0\n0\n0:00\n13:53\nP/WO-I")
        else:
            details.append("Gene\n06:53\n14:53\n0\n0\n0:00\n8:00\nP")
    return [
        ["Employee's Performance Register For the Month of : June-2026"],
        [],
        [],
        ["Emp Code : 4", None, None, "Emp Name : xxx", None, "Present : 26.00"],
        [],
        dates,
        weekdays,
        details,
    ]


def test_reference_register_shape_is_normalized():
    parsed = parse_register_rows(build_register_rows())
    employee = parsed["employees"][0]
    assert parsed["month"] == "2026-06"
    assert employee["employeeCode"] == "4"
    assert employee["employeeName"] == "xxx"
    assert len(employee["days"]) == 30
    assert employee["days"][6]["status"] == "holiday"
    assert employee["days"][7]["status"] == "missing"
    assert employee["days"][7]["outTime"] is None


def test_multiple_employee_blocks_are_found_vertically():
    first = build_register_rows()
    second = build_register_rows()[3:]
    second[0] = ["Emp Code : 5", None, None, "Emp Name : yyy"]
    parsed = parse_register_rows(first + [[], []] + second)
    assert [employee["employeeCode"] for employee in parsed["employees"]] == ["4", "5"]

from app.domain.statuses import normalize_status


def test_weekly_off_codes_are_holidays():
    assert normalize_status("P/WO-I") == "holiday"
    assert normalize_status("M/WO-I") == "holiday"
    assert normalize_status("W-I-O") == "holiday"
    assert normalize_status("W0-I") == "holiday"

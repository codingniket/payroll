from app.domain.time_values import (
    format_minutes,
    parse_clock_minutes,
    parse_minutes,
    worked_minutes_from_punches,
)


def test_duration_and_clock_parsing():
    assert parse_minutes("425:10") == 25_510
    assert parse_clock_minutes("22:31") == 1_351
    assert parse_clock_minutes("25:00") is None
    assert format_minutes(150) == "2:30"


def test_overnight_punches_roll_into_next_day():
    assert worked_minutes_from_punches("22:00", "06:00") == 480

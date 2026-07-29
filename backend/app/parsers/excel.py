from __future__ import annotations

from pathlib import Path

from python_calamine import CalamineWorkbook

from .register import parse_register_rows


def parse_excel(path: Path) -> dict:
    workbook = CalamineWorkbook.from_path(str(path))
    sheet = workbook.get_sheet_by_index(0)
    rows = sheet.to_python(skip_empty_area=False)
    return parse_register_rows(rows)

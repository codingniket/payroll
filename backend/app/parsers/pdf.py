from __future__ import annotations

from pathlib import Path

import pdfplumber

from .register import RegisterParseError, parse_register_rows


def parse_pdf(path: Path) -> dict:
    rows: list[list[object]] = []
    with pdfplumber.open(path) as document:
        for page in document.pages:
            tables = page.extract_tables()
            for table in tables:
                rows.extend(table)
    if not rows:
        raise RegisterParseError(
            "The PDF has no selectable attendance table. Upload the Excel file or a text-based PDF."
        )
    return parse_register_rows(rows)

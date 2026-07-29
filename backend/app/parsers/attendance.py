from __future__ import annotations

from pathlib import Path

from .excel import parse_excel
from .pdf import parse_pdf
from .register import RegisterParseError


def parse_attendance_file(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix in {".xls", ".xlsx"}:
        return parse_excel(path)
    if suffix == ".pdf":
        return parse_pdf(path)
    raise RegisterParseError("Upload an XLS, XLSX, or PDF attendance file.")

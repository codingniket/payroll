from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any


class JsonStore:
    def __init__(self, data_directory: Path):
        self.data_directory = Path(data_directory)
        self.job_path = self.data_directory / "data.json"
        self.employees_path = self.data_directory / "employee.json"

    def load_job(self) -> dict[str, Any] | None:
        if not self.job_path.exists():
            return None
        content = self.job_path.read_text(encoding="utf-8").strip()
        return json.loads(content) if content else None

    def save_job(self, job: dict[str, Any]) -> None:
        self.data_directory.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self.data_directory,
            delete=False,
            suffix=".tmp",
        ) as temporary_file:
            json.dump(job, temporary_file, indent=2, ensure_ascii=False)
            temporary_path = Path(temporary_file.name)
        os.replace(temporary_path, self.job_path)

    def clear_job(self) -> None:
        self.job_path.write_text("", encoding="utf-8")

    def load_employee_master(self) -> list[dict[str, Any]]:
        if not self.employees_path.exists():
            return []
        payload = json.loads(self.employees_path.read_text(encoding="utf-8"))
        return payload.get("employees", payload) if isinstance(payload, dict) else payload

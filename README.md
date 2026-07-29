# Payday Ledger

A modular Next.js and Flask application that converts monthly attendance registers into base and overtime payroll reports.

## Project structure

- `backend/app/parsers` — XLS, XLSX, PDF, and register normalization
- `backend/app/services` — employee matching, validation, calculations, and exports
- `backend/app/repositories` — atomic `data.json` persistence
- `backend/app/api` — user-safe HTTP endpoints
- `frontend/features` — payroll state and workflows
- `frontend/components` — reusable UI and payroll controls
- `frontend/app` — landing, upload, hours, base payroll, and overtime routes

## Employee master

Populate `backend/data/employee.json` before uploading attendance:

```json
{
  "employees": [
    {
      "employee_code": "4",
      "name": "Employee name exactly as registered",
      "salary": 30000,
      "shift_hours": 8
    }
  ]
}
```

Employee codes must match exactly. Names are matched case-insensitively after extra whitespace is removed.
Lowercase snake_case keys are the default. Existing `employeeCode` and `shiftHours` keys remain supported.

## Run locally

Backend:

```powershell
cd backend
uv sync --dev
uv run python run.py
```

Frontend, in a second terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:5000/api/payroll`; copy `frontend/.env.example` to `.env.local` to change it.

## Verification

```powershell
cd backend
uv run pytest
uv run ruff check .

cd ..\frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

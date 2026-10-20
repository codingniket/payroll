# New Payroll

Payday Ledger is now a single Next.js application. The former `backend/` Flask service and `frontend/` application have been replaced by route handlers and server-side TypeScript at the repository root. No login or authentication is included, as requested for personal use.

## Run

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3001`. The new app uses port 3001 deliberately so it cannot be confused with the original app on port 3000.

Run these commands from the repository root. Python and a separate API server are no longer required. For production, run `npm.cmd run build` followed by `npm.cmd start`.

The employee master and active payroll are stored independently in `data/employee.json` and `data/data.json`. Employee additions, edits, and deletions are written to that file and survive server restarts. XLS, XLSX, and selectable-text PDF attendance registers are accepted.

On a fresh checkout, add employees through the Employees screen, or copy `data/employee.example.json` to `data/employee.json` and replace the example records. Personal payroll data is ignored by Git. The current local employee master has been preserved.

## Migration and hosting

Back up the old `backend/data` directory before changing an existing installation. Copy its employee master to `data/employee.json` without overwriting a newer master. Upload the month's attendance again to start a payroll in the new version; the old Flask job format is not migrated automatically. The previous application and its files remain recoverable from Git history.

Use one Node process with a persistent writable data directory. Set `PAYROLL_DATA_DIRECTORY` to an absolute directory to store data outside the checkout. Do not run multiple replicas against these JSON files or place them on ephemeral serverless storage. Keep backups of the data directory. The application maintains one active payroll; uploading a register replaces it, and Exit clears it.

## Editing and downloading

- Salary, shift, daily rate, attendance counts, and total hours are shared between base and overtime payroll.
- Increasing Present reduces Absent by the same amount, and vice versa. Changing Holidays opens a dialog asking you to reconcile Present and Absent so the counts total the month's days.
- Editing an upstream input recalculates dependent totals, replacing older manual overrides on those totals. Unrelated overrides remain. Reset restores the calculated value.
- Downloads save the focused field and wait for pending changes. Invalid or failed edits block downloading and show an error. Another tab's changes produce a conflict message instead of overwriting them; reload to work from the latest payroll.
- Employees in the master but missing from the upload remain visible, with identity-only rows and blank values in both workbooks. They contribute no payout. Supply attendance in a new upload to calculate them.
- A monthly count adjustment does not invent daily punches or overtime hours. Correct daily records or edit overtime hours separately when needed.

See [the payroll audit](docs/payroll-audit.md) for formulas, security findings, and remaining limitations.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

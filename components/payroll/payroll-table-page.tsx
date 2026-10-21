"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Timer, TimerReset, WalletCards } from "lucide-react";
import { BaseValueEditor } from "./base-value-editor";
import { ExitButton } from "./exit-button";
import { PageShell } from "./page-shell";
import { PayrollSummary } from "./payroll-summary";
import { StateMessage } from "./state-message";
import { Button } from "@/components/ui/button";
import { usePayrollJob } from "@/features/payroll/use-payroll-job";
import { payrollApi } from "@/lib/payroll-api";
import { formatMinutes, parseDuration } from "@/lib/time";
import type { PayrollChanges, SalaryCalculationMethod } from "@/types/payroll";

const baseFields = [
  ["shiftHours", "Shift"], ["salary", "Salary"], ["perDay", "Per day"],
  ["totalAbsent", "Absent"], ["holiday", "Holiday"], ["totalPresent", "Present"],
  ["absentDeduction", "Absent deduction"], ["totalHoursMinutes", "Expected hours"],
  ["actualHoursWorkedMinutes", "Actual hours"], ["advance", "Advance"],
  ["lateTimeMinutes", "Late time"], ["lateFine", "LT fine"], ["deduction", "Deduction"], ["netAmount", "Net amount"],
] as const;
const overtimeFields = [
  ["shiftHours", "Shift"], ["newSalary", "Salary"], ["totalAbsent", "Absent"], ["holiday", "Holiday"],
  ["totalPresent", "Present"], ["totalHoursMinutes", "Expected hours"], ["perDay", "Per day"],
  ["actualHoursWorkedMinutes", "Actual hours"], ["overtimeHoursMinutes", "OT hours"],
  ["overtimeShiftDivisor", "OT divisor"], ["overtimeTotal", "OT total"], ["tiffin", "Tiffin"], ["netAmountOt", "Net OT"],
] as const;
type Draft = { employeeCode: string; field: string; text: string; sequence: number };
type HolidayDraft = { employeeCode: string; name: string; holiday: string; present: string; absent: string };

export function PayrollTablePage({ kind }: { kind: "base" | "overtime" }) {
  const router = useRouter();
  const { job, loading, error, setError, mutate, flush, pending } = usePayrollJob();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef<Record<string, Draft>>({});
  const sequence = useRef(0);
  const inFlight = useRef(new Map<number, Promise<void>>());
  const [busy, setBusy] = useState(false);
  const [holidayDraft, setHolidayDraft] = useState<HolidayDraft | null>(null);
  const [holidayError, setHolidayError] = useState("");
  const keyFor = (code: string, field: string) => JSON.stringify([code, field]);
  const message = (caught: unknown) => setError(caught instanceof Error ? caught.message : "The change could not be saved.");
  function replaceDrafts(next: Record<string, Draft>) { draftsRef.current = next; setDrafts(next); }

  function edit(employeeCode: string, field: string, text: string) {
    const key = keyFor(employeeCode, field);
    replaceDrafts({ ...draftsRef.current, [key]: { employeeCode, field, text, sequence: ++sequence.current } });
  }
  function saveChanges(employeeCode: string, changes: PayrollChanges, key: string) {
    const manualEntry = job?.basePayroll.some((row) => row.employeeCode === employeeCode && row.manualEntry);
    return mutate((current) => kind === "base"
      ? manualEntry ? payrollApi.updateManualBase(employeeCode, changes, current) : payrollApi.updateBase(employeeCode, changes, current)
      : payrollApi.updateOvertime(employeeCode, changes, current), key);
  }
  async function commit(key: string) {
    const draft = draftsRef.current[key];
    if (!draft) return;
    const existing = inFlight.current.get(draft.sequence);
    if (existing) return existing;
    const operation = (async () => {
      const value = draft.field.endsWith("Minutes") ? parseDuration(draft.text) : draft.text.trim() ? Number(draft.text) : null;
      if (value === null || !Number.isFinite(value)) throw new Error(`Enter a valid ${draft.field.endsWith("Minutes") ? "H:MM duration" : "number"} before saving.`);
      await saveChanges(draft.employeeCode, { [draft.field]: value }, key);
      if (draftsRef.current[key]?.sequence === draft.sequence) {
        const next = { ...draftsRef.current }; delete next[key]; replaceDrafts(next);
      }
    })();
    inFlight.current.set(draft.sequence, operation);
    try { await operation; }
    finally { inFlight.current.delete(draft.sequence); }
  }
  async function flushDrafts() {
    if (holidayDraft) throw new Error("Finish adjusting Holidays, Present, and Absent first.");
    // Controlled drafts include the focused field; downloading never relies on blur timing.
    for (const key of Object.keys(draftsRef.current)) await commit(key);
    return flush();
  }
  async function perform(action: (current: NonNullable<typeof job>) => Promise<void>) {
    setBusy(true); setError("");
    try { await action(await flushDrafts()); }
    catch (caught) { message(caught); }
    finally { setBusy(false); }
  }
  async function download(current: NonNullable<typeof job>) {
    const blob = await payrollApi.download(kind, current);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${kind}-payroll-${current.month}.xlsx`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reset(employeeCode: string, field: string) {
    const key = keyFor(employeeCode, field);
    const draftSequence = draftsRef.current[key]?.sequence;
    try {
      await saveChanges(employeeCode, { [field]: null }, key);
      if (draftsRef.current[key]?.sequence === draftSequence) {
        const next = { ...draftsRef.current }; delete next[key]; replaceDrafts(next);
      }
    } catch (caught) { message(caught); }
  }
  async function saveHolidays(event: React.FormEvent) {
    event.preventDefault();
    if (!holidayDraft) return;
    setBusy(true); setHolidayError("");
    try {
      const values = [holidayDraft.holiday, holidayDraft.present, holidayDraft.absent];
      if (values.some((value) => !value.trim())) throw new Error("Enter Holidays, Present, and Absent.");
      const counts = values.map(Number);
      if (counts.some((value) => !Number.isInteger(value) || value < 0) || counts.reduce((sum, value) => sum + value, 0) !== monthDays) {
        throw new Error(`Present + Absent + Holidays must equal ${monthDays}.`);
      }
      await saveChanges(holidayDraft.employeeCode, {
        holiday: Number(holidayDraft.holiday), totalPresent: Number(holidayDraft.present), totalAbsent: Number(holidayDraft.absent),
      }, keyFor(holidayDraft.employeeCode, "holiday"));
      setHolidayDraft(null);
    } catch (caught) { setHolidayError(caught instanceof Error ? caught.message : "The counts could not be saved."); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="centerState">Loading payroll…</main>;
  const title = kind === "base" ? "Base payroll" : "Overtime payroll";
  if (!job) return <PageShell stage={kind} title={title} description="Review monthly pay."><StateMessage title={error || "No payroll is in progress."} uploadLink /></PageShell>;
  const fields = kind === "base" ? baseFields : overtimeFields;
  const rows = kind === "base" ? job.basePayroll : job.overtimePayroll;
  const total = kind === "base"
    ? job.basePayroll.reduce((sum, row) => sum + (row.netAmount ?? 0), 0)
    : job.overtimePayroll.reduce((sum, row) => sum + (row.netAmountOt ?? 0), 0);
  const monthDays = new Date(Number(job.month.slice(0, 4)), Number(job.month.slice(5)), 0).getDate();
  return (
    <PageShell stage={kind} month={job.month} title={title} description="Changes update both payroll reports. Downloads include all saved edits." onNavigate={(href) => { if (!busy) void perform(async () => router.push(href)); }} actions={<>
      {kind === "base" ? <label className="salaryMethodPicker"><span>Salary basis</span><select aria-label="Salary basis" value={job.salaryCalculationMethod} disabled={busy || !!holidayDraft} onChange={(event) => {
        const method = event.target.value as SalaryCalculationMethod;
        void perform(async () => { await mutate((current) => payrollApi.calculateBase(method, current)); });
      }}><option value="total_days">Total days</option><option value="working_days">Working days</option></select></label> : null}
      <Button variant="secondary" disabled={busy || !rows.length || !!holidayDraft} onClick={() => void perform(download)}><Download size={16} /> {busy ? "Please wait…" : "Download Excel"}</Button>
      <ExitButton beforeExit={flushDrafts} disabled={busy || !!holidayDraft} />
    </>}>
      {error ? <p className="formError" role="alert">{error}</p> : null}
      <p className="helperText" role="status">{pending ? "Saving changes…" : error ? "Changes need attention before downloading." : Object.keys(drafts).length ? "Unsaved edits — download will save them first." : "All changes saved."}</p>
      {rows.length ? <PayrollSummary employeeCount={job.employees.length} totalLabel={kind === "base" ? "Final net payroll" : "Final overtime payout"} totalAmount={total} totalIcon={kind === "base" ? WalletCards : Timer} /> : null}
      {!rows.length ? <StateMessage title="Payroll has not been calculated." detail="Return to working hours and resolve the remaining records." /> :
        <div className="tableFrame"><table className="dataTable payrollTable"><thead><tr><th className="stickyColumn">Employee</th>{fields.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.employeeCode}>
            <td className="stickyColumn employeeCell"><strong>{row.employeeName}</strong><span>{row.employeeCode}</span>{kind === "base" && "manualEntry" in row && row.manualEntry ? <small>Manual payroll · review values; attendance unchanged</small> : row.attendanceSource === "not_uploaded" ? <><small>Attendance not uploaded</small>{kind === "base" ? <Button variant="quiet" size="small" disabled={busy || !!holidayDraft} onClick={() => void perform(async () => { await mutate((latest) => payrollApi.startManualBase(row.employeeCode, latest)); })}>Enter payroll manually</Button> : null}</> : null}</td>
            {fields.map(([field]) => {
              const manualEntry = kind === "base" && "manualEntry" in row && row.manualEntry === true;
              if (row.attendanceSource === "not_uploaded" && !manualEntry) return <td key={field} />;
              const key = keyFor(row.employeeCode, field);
              const value = (row as unknown as Record<string, number>)[field];
              const duration = field.endsWith("Minutes");
              if (field === "holiday" && !manualEntry) return <td key={field}><div className={row.overriddenFields.includes(field) ? "valueEditor overridden" : "valueEditor"}>
                <button type="button" disabled={busy || !!holidayDraft} aria-label={`Adjust holidays for ${row.employeeName}`} onClick={() => void perform(async (current) => {
                  const latest = current.basePayroll.find((item) => item.employeeCode === row.employeeCode)!;
                  setHolidayError(""); setHolidayDraft({ employeeCode: row.employeeCode, name: row.employeeName, holiday: String(latest.holiday), present: String(latest.totalPresent), absent: String(latest.totalAbsent) });
                })}>{value} · Edit</button>
                {row.overriddenFields.includes(field) ? <button type="button" disabled={busy} title="Reset holiday counts" onClick={() => void reset(row.employeeCode, field)}>Reset</button> : null}
              </div></td>;
              return <td key={field}><BaseValueEditor field={field} duration={duration} value={drafts[key]?.text ?? (duration ? formatMinutes(value) : String(value))}
                overridden={row.overriddenFields.includes(field)} disabled={busy || !!holidayDraft}
                onChange={(text) => edit(row.employeeCode, field, text)}
                onCommit={() => { void commit(key).catch(message); }}
                onReset={() => void reset(row.employeeCode, field)} /></td>;
            })}
          </tr>)}</tbody></table></div>}
      {rows.length ? <div className="pageFooter"><Button disabled={busy || !!holidayDraft} onClick={() => void perform(async () => {
        if (kind === "base") await mutate((current) => payrollApi.calculateOvertime(current));
        router.push(kind === "base" ? "/overtime" : "/base-payroll");
      })}><TimerReset size={17} /> {kind === "base" ? "Calculate overtime" : "Review base payroll"}</Button></div> : null}
      {holidayDraft ? <div className="payrollDialogBackdrop"><section className="payrollDialog" role="dialog" aria-modal="true" aria-labelledby="holiday-title">
        <h2 id="holiday-title">Adjust attendance · {holidayDraft.name}</h2>
        <p>After changing Holidays, adjust Present and Absent. The three counts must total {monthDays}.</p>
        <form onSubmit={(event) => void saveHolidays(event)}>
          {(["holiday", "present", "absent"] as const).map((field) => <label key={field}>{field === "holiday" ? "Holidays" : field === "present" ? "Present" : "Absent"}
            <input autoFocus={field === "holiday"} required type="number" min="0" max={monthDays} step="1" value={holidayDraft[field]} disabled={busy} onChange={(event) => setHolidayDraft({ ...holidayDraft, [field]: event.target.value })} />
          </label>)}
          {holidayError ? <p className="formError" role="alert">{holidayError}</p> : null}
          <div className="pageFooter"><Button type="button" variant="secondary" disabled={busy} onClick={() => setHolidayDraft(null)}>Cancel</Button><Button disabled={busy}>Save counts</Button></div>
        </form>
      </section></div> : null}
    </PageShell>
  );
}

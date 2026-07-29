"use client";

import { Download } from "lucide-react";
import { BaseValueEditor } from "@/components/payroll/base-value-editor";
import { ExitButton } from "@/components/payroll/exit-button";
import { PageShell } from "@/components/payroll/page-shell";
import { StateMessage } from "@/components/payroll/state-message";
import { usePayrollJob } from "@/features/payroll/use-payroll-job";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";

const fields = [
  ["shiftHours", "Shift", false], ["newSalary", "Salary", false],
  ["totalAbsent", "Absent", false], ["holiday", "Holiday", false],
  ["totalPresent", "Present", false], ["totalHoursMinutes", "Expected hours", true],
  ["perDay", "Per day", false], ["actualHoursWorkedMinutes", "Actual hours", true],
  ["overtimeHoursMinutes", "OT hours", true], ["overtimeShiftDivisor", "OT divisor", false],
  ["overtimeTotal", "OT total", false], ["tiffin", "Tiffin", false],
  ["netAmountOt", "Net OT", false],
] as const;

export default function OvertimePage() {
  const { job, setJob, loading, error, setError } = usePayrollJob();
  if (loading) return <main className="centerState">Calculating overtime…</main>;
  if (!job) return <PageShell stage="overtime" title="Overtime payroll" description="Review overtime pay."><StateMessage title={error || "No payroll is in progress."} uploadLink /></PageShell>;
  async function update(employeeCode: string, field: string, value?: number) {
    const employee = job!.employees.find((item) => item.employeeCode === employeeCode)!;
    const overrides = { ...(employee.overtimeOverrides ?? {}) };
    if (value === undefined) delete overrides[field]; else overrides[field] = value;
    try { setJob(await payrollApi.updateOvertime(employeeCode, overrides)); setError(""); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "The overtime change could not be saved."); }
  }

  return (
    <PageShell stage="overtime" month={job.month} title="Overtime payroll" description="Final overtime and tiffin amounts." actions={<><a className="button buttonSecondary buttonDefault" href={payrollApi.downloadUrl("overtime")}><Download size={16} /> Download Excel</a><ExitButton /></>}>
      {error ? <p className="formError" role="alert">{error}</p> : null}
      {!job.overtimePayroll.length ? <StateMessage title="Overtime payroll has not been calculated." detail="Calculate it from the base payroll page." /> : <div className="tableFrame"><table className="dataTable payrollTable"><thead><tr><th className="stickyColumn">Employee</th>{fields.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{job.overtimePayroll.map((result) => <tr key={result.employeeCode}><td className="stickyColumn employeeCell"><strong>{result.employeeName}</strong><span>{result.employeeCode}</span></td>{fields.map(([field, , duration]) => <td key={field}><BaseValueEditor key={`${field}-${result[field]}-${result.overriddenFields.includes(field)}`} field={field} value={result[field]} duration={duration} overridden={result.overriddenFields.includes(field)} onChange={(name, value) => void update(result.employeeCode, name, value)} onReset={(name) => void update(result.employeeCode, name)} /></td>)}</tr>)}</tbody></table></div>}
    </PageShell>
  );
}

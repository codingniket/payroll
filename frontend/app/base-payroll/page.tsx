"use client";

import { useRouter } from "next/navigation";
import { Download, TimerReset } from "lucide-react";
import { BaseValueEditor } from "@/components/payroll/base-value-editor";
import { ExitButton } from "@/components/payroll/exit-button";
import { PageShell } from "@/components/payroll/page-shell";
import { StateMessage } from "@/components/payroll/state-message";
import { Button } from "@/components/ui/button";
import { usePayrollJob } from "@/features/payroll/use-payroll-job";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";

const fields = [
  ["shiftHours", "Shift", false], ["salary", "Salary", false], ["perDay", "Per day", false],
  ["totalAbsent", "Absent", false], ["holiday", "Holiday", false], ["totalPresent", "Present", false],
  ["absentDeduction", "Absent deduction", false], ["totalHoursMinutes", "Expected hours", true],
  ["actualHoursWorkedMinutes", "Actual hours", true], ["advance", "Advance", false],
  ["lateTimeMinutes", "Late time", true], ["lateFine", "LT fine", false], ["deduction", "Deduction", false],
  ["netAmount", "Net amount", false],
] as const;

export default function BasePayrollPage() {
  const router = useRouter();
  const { job, setJob, loading, error, setError } = usePayrollJob();
  if (loading) return <main className="centerState">Calculating payroll…</main>;
  if (!job) return <PageShell stage="base" title="Base payroll" description="Review monthly pay."><StateMessage title={error || "No payroll is in progress."} uploadLink /></PageShell>;

  async function update(employeeCode: string, field: string, value?: number) {
    const employee = job!.employees.find((item) => item.employeeCode === employeeCode)!;
    const overrides = { ...employee.baseOverrides };
    if (value === undefined) delete overrides[field]; else overrides[field] = value;
    try { setJob(await payrollApi.updateBase(employeeCode, overrides)); setError(""); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "The change could not be saved."); }
  }

  async function openOvertime() {
    try { await payrollApi.calculateOvertime(); router.push("/overtime"); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "Overtime could not be calculated."); }
  }

  return (
    <PageShell stage="base" month={job.month} title="Base payroll" description="Calculated values can be adjusted before download." actions={<><a className="button buttonSecondary buttonDefault" href={payrollApi.downloadUrl("base")}><Download size={16} /> Download Excel</a><ExitButton /></>}>
      {error ? <p className="formError" role="alert">{error}</p> : null}
      {!job.basePayroll.length ? <StateMessage title="Base payroll has not been calculated." detail="Return to working hours and resolve the remaining records." /> : (
        <div className="tableFrame"><table className="dataTable payrollTable"><thead><tr><th className="stickyColumn">Employee</th>{fields.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{job.basePayroll.map((result) => <tr key={result.employeeCode}><td className="stickyColumn employeeCell"><strong>{result.employeeName}</strong><span>{result.employeeCode}</span></td>{fields.map(([field, , duration]) => <td key={field}><BaseValueEditor key={`${field}-${result[field]}-${result.overriddenFields.includes(field)}`} field={field} value={result[field]} duration={duration} overridden={result.overriddenFields.includes(field)} onChange={(name, value) => void update(result.employeeCode, name, value)} onReset={(name) => void update(result.employeeCode, name)} /></td>)}</tr>)}</tbody></table></div>
      )}
      {job.basePayroll.length ? <div className="pageFooter"><Button onClick={() => void openOvertime()}><TimerReset size={17} /> Calculate overtime</Button></div> : null}
    </PageShell>
  );
}

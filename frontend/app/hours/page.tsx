"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";
import { AttendanceRow } from "@/components/payroll/attendance-row";
import { PageShell } from "@/components/payroll/page-shell";
import { StateMessage } from "@/components/payroll/state-message";
import { Button } from "@/components/ui/button";
import { usePayrollJob } from "@/features/payroll/use-payroll-job";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";

export default function HoursPage() {
  const router = useRouter();
  const { job, setJob, loading, error, setError } = usePayrollJob();
  const [selectedCode, setSelectedCode] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [applyingDefault, setApplyingDefault] = useState(false);
  const activeEmployeeCode = selectedCode || job?.employees[0]?.employeeCode || "";
  const employee = useMemo(
    () => job?.employees.find((item) => item.employeeCode === activeEmployeeCode),
    [activeEmployeeCode, job],
  );

  if (loading) return <main className="centerState">Reading attendance…</main>;
  if (!job) return <PageShell stage="hours" title="Review hours" description="Check each employee before payroll."><StateMessage title={error || "No payroll is in progress."} uploadLink /></PageShell>;

  const issueCount = job.unresolvedAttendanceIssues.length;
  async function continueToBase() {
    setCalculating(true); setError("");
    try { await payrollApi.calculateBase(); router.push("/base-payroll"); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "Payroll could not be calculated."); }
    finally { setCalculating(false); }
  }

  async function applyDefaultShift() {
    if (!employee) return;
    setApplyingDefault(true); setError("");
    try { setJob(await payrollApi.applyDefaultShift(employee.employeeCode)); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "Default shift could not be applied."); }
    finally { setApplyingDefault(false); }
  }

  return (
    <PageShell stage="hours" month={job.month} title="Review working hours" description="Correct highlighted days. Changes save automatically." actions={<Button onClick={() => void continueToBase()} disabled={issueCount > 0 || calculating}>Continue <ArrowRight size={16} /></Button>}>
      <div className="reviewBar">
        <div className="employeeControls">
          <label>Employee<select value={activeEmployeeCode} onChange={(event) => setSelectedCode(event.target.value)}>{job.employees.map((item) => <option key={item.employeeCode} value={item.employeeCode}>{item.employeeName} · {item.employeeCode}</option>)}</select></label>
          <Button variant="secondary" size="small" disabled={!employee?.matched || applyingDefault} title="Make every punched day Present at this employee's shift hours" onClick={() => void applyDefaultShift()}><Sparkles size={14} /> {applyingDefault ? "Applying…" : "Default"}</Button>
        </div>
        <span className={issueCount ? "issueCount" : "readyCount"}>{issueCount ? <><TriangleAlert size={15} /> {issueCount} to review</> : "All records ready"}</span>
      </div>
      {!employee?.matched ? <StateMessage title="Employee does not match the employee list." detail="Check both the employee code and name in employee.json." /> : null}
      {error ? <p className="formError" role="alert">{error}</p> : null}
      {employee ? <div className="tableFrame"><table className="dataTable attendanceTable"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Status</th><th>Review</th></tr></thead><tbody>{employee.days.map((day) => <AttendanceRow key={`${employee.employeeCode}-${day.date}`} day={day} onSave={async (changes) => setJob(await payrollApi.updateAttendance({ employeeCode: employee.employeeCode, date: day.date, ...changes }))} />)}</tbody></table></div> : null}
    </PageShell>
  );
}

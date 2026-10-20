"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";
import { AttendanceRow } from "@/components/payroll/attendance-row";
import { PageShell } from "@/components/payroll/page-shell";
import { StateMessage } from "@/components/payroll/state-message";
import { Button } from "@/components/ui/button";
import { usePayrollJob } from "@/features/payroll/use-payroll-job";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";
import { formatRupees } from "@/lib/time";
import type { PayrollJob, SalaryCalculationMethod, SalaryMethodComparison } from "@/types/payroll";

export default function HoursPage() {
  const router = useRouter();
  const { job, loading, error, setError, mutate, flush, pending } = usePayrollJob();
  const [selectedCode, setSelectedCode] = useState("");
  const [lastReviewIssueKey, setLastReviewIssueKey] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{ employeeCode: string; date: string | null; sequence: number } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [applyingDefault, setApplyingDefault] = useState(false);
  const [selectedSalaryMethod, setSelectedSalaryMethod] = useState<SalaryCalculationMethod | "">("");
  const [comparisonState, setComparisonState] = useState<{
    job: PayrollJob;
    result?: SalaryMethodComparison;
    error?: string;
  } | null>(null);
  const activeEmployeeCode = selectedCode || job?.employees[0]?.employeeCode || "";
  const employee = useMemo(
    () => job?.employees.find((item) => item.employeeCode === activeEmployeeCode),
    [activeEmployeeCode, job],
  );
  const salaryCalculationMethod = selectedSalaryMethod || job?.salaryCalculationMethod || "total_days";
  const issueCount = job?.unresolvedAttendanceIssues.length ?? 0;

  useEffect(() => {
    let active = true;
    if (!job || issueCount > 0) return () => { active = false; };
    payrollApi.compareSalaryMethods()
      .then((result) => { if (active) setComparisonState({ job, result }); })
      .catch((caught) => { if (active) setComparisonState({ job, error: caught instanceof PayrollApiError ? caught.message : "Salary methods could not be compared." }); });
    return () => { active = false; };
  }, [issueCount, job]);

  useEffect(() => {
    if (!reviewTarget || activeEmployeeCode !== reviewTarget.employeeCode) return;
    const targetId = reviewTarget.date
      ? attendanceIssueId(reviewTarget.employeeCode, reviewTarget.date)
      : employeeIssueId(reviewTarget.employeeCode);
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeEmployeeCode, reviewTarget]);

  if (loading) return <main className="centerState">Reading attendance…</main>;
  if (!job) return <PageShell stage="hours" title="Review hours" description="Check each employee before payroll."><StateMessage title={error || "No payroll is in progress."} uploadLink /></PageShell>;

  async function continueToBase() {
    setCalculating(true); setError("");
    try { await flush(); await mutate((current) => payrollApi.calculateBase(salaryCalculationMethod, current)); router.push("/base-payroll"); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "Payroll could not be calculated."); }
    finally { setCalculating(false); }
  }

  async function applyDefaultShift() {
    if (!employee) return;
    setApplyingDefault(true); setError("");
    try { await flush(); await mutate((current) => payrollApi.applyDefaultShift(employee.employeeCode, current)); }
    catch (caught) { setError(caught instanceof PayrollApiError ? caught.message : "Default shift could not be applied."); }
    finally { setApplyingDefault(false); }
  }

  function showNextIssue() {
    const issues = job!.unresolvedAttendanceIssues.filter(
      (issue, index, allIssues) => allIssues.findIndex(
        (candidate) => issueKey(candidate.employeeCode, candidate.date) === issueKey(issue.employeeCode, issue.date),
      ) === index,
    );
    if (!issues.length) return;
    const currentIndex = issues.findIndex(
      (issue) => issueKey(issue.employeeCode, issue.date) === lastReviewIssueKey,
    );
    const nextIssue = issues[(currentIndex + 1) % issues.length];
    setLastReviewIssueKey(issueKey(nextIssue.employeeCode, nextIssue.date));
    setSelectedCode(nextIssue.employeeCode);
    setReviewTarget({
      employeeCode: nextIssue.employeeCode,
      date: nextIssue.date,
      sequence: Date.now(),
    });
  }

  const currentComparison = comparisonState?.job === job ? comparisonState : null;
  const selectedTotal = salaryCalculationMethod === "total_days"
    ? currentComparison?.result?.totalDaysNetPayroll
    : currentComparison?.result?.workingDaysNetPayroll;
  const alternativeTotal = salaryCalculationMethod === "total_days"
    ? currentComparison?.result?.workingDaysNetPayroll
    : currentComparison?.result?.totalDaysNetPayroll;
  const alternativeLabel = salaryCalculationMethod === "total_days" ? "Working days" : "Total days";
  const comparisonDifference = selectedTotal !== undefined && alternativeTotal !== undefined
    ? selectedTotal - alternativeTotal
    : null;

  return (
    <PageShell stage="hours" month={job.month} title="Review working hours" description="Correct highlighted days. Changes save automatically." onNavigate={(href) => { void flush().then(() => router.push(href)).catch((caught) => setError((caught as Error).message)); }} actions={<><label className="salaryMethodPicker"><span>Salary basis</span><select value={salaryCalculationMethod} onChange={(event) => setSelectedSalaryMethod(event.target.value as SalaryCalculationMethod)}><option value="total_days">Total days</option><option value="working_days">Working days</option></select></label><Button onClick={() => void continueToBase()} disabled={issueCount > 0 || calculating || pending > 0}>Continue <ArrowRight size={16} /></Button></>}>
      <section className="methodComparison" aria-live="polite">
        <div><small>Selected net payroll</small><strong>{selectedTotal !== undefined ? formatRupees(selectedTotal) : "—"}</strong></div>
        <p>{issueCount > 0 ? `Resolve ${issueCount} attendance ${issueCount === 1 ? "issue" : "issues"} to compare salary methods.` : currentComparison?.error || (comparisonDifference === 0 ? `Same total as ${alternativeLabel}.` : comparisonDifference !== null ? `${formatRupees(Math.abs(comparisonDifference))} ${comparisonDifference < 0 ? "cheaper" : "more expensive"} than ${alternativeLabel}.` : "Comparing salary methods…")}</p>
      </section>
      <div className="reviewBar">
        <div className="employeeControls">
          <label>Employee<select value={activeEmployeeCode} onChange={(event) => setSelectedCode(event.target.value)}>{job.employees.map((item) => <option key={item.employeeCode} value={item.employeeCode}>{item.employeeName} · {item.employeeCode}</option>)}</select></label>
          <Button variant="secondary" size="small" disabled={!employee?.matched || employee?.attendanceSource === "not_uploaded" || applyingDefault || pending > 0} title="Make every punched day Present at this employee's shift hours" onClick={() => void applyDefaultShift()}><Sparkles size={14} /> {applyingDefault ? "Applying…" : "Default"}</Button>
        </div>
        {issueCount ? <button type="button" className="issueCount" onClick={showNextIssue} title="Go to the next attendance issue"><TriangleAlert size={15} /> {issueCount} to review <span aria-hidden="true">→</span></button> : <span className="readyCount">All records ready</span>}
      </div>
      {employee && !employee.matched ? <div id={employeeIssueId(employee.employeeCode)} tabIndex={-1} className="employeeIssueTarget"><StateMessage title="Employee does not match the employee list." detail="Check both the employee code and name in employee.json." /></div> : null}
      {error ? <p className="formError" role="alert">{error}</p> : null}
      {employee?.attendanceSource === "not_uploaded" ? <StateMessage title={`${employee.employeeName} · ${employee.employeeCode}`} detail="Attendance not uploaded. This employee will appear as a blank row in both payroll reports." /> : employee ? <div className="tableFrame"><table className="dataTable attendanceTable"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Status</th><th>Review</th></tr></thead><tbody>{employee.days.map((day) => <AttendanceRow key={`${employee.employeeCode}-${day.date}`} rowId={attendanceIssueId(employee.employeeCode, day.date)} day={day} disabled={calculating || applyingDefault} onSave={async (changes) => { await mutate((current) => payrollApi.updateAttendance({ employeeCode: employee.employeeCode, date: day.date, ...changes }, current), `${employee.employeeCode}:${day.date}`); }} />)}</tbody></table></div> : null}
    </PageShell>
  );
}

function issueKey(employeeCode: string, date: string | null): string {
  return `${employeeCode}:${date ?? "employee"}`;
}

function attendanceIssueId(employeeCode: string, date: string): string {
  return `attendance-issue-${encodeURIComponent(employeeCode)}-${date}`;
}

function employeeIssueId(employeeCode: string): string {
  return `employee-issue-${encodeURIComponent(employeeCode)}`;
}

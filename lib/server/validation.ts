import type { AttendanceIssue } from "@/types/payroll";
import type { ServerDay, ServerJob } from "./model";
import { parseClockMinutes } from "./time";

export function dayIssues(day: ServerDay): AttendanceIssue[] {
  const issues: AttendanceIssue[] = [];
  if (!["present", "absent", "holiday"].includes(day.status)) return [{ code: "unresolved_status", message: "Choose Present, Absent, or Holiday." }];
  if (day.status !== "present" && !(day.status === "holiday" && (day.inTime || day.outTime || day.workedMinutes))) return issues;
  if (parseClockMinutes(day.inTime) === null || parseClockMinutes(day.outTime) === null) issues.push({ code: "missing_punch", message: "Add valid in and out times." });
  if (day.workedMinutes === null || !Number.isInteger(day.workedMinutes) || day.workedMinutes < 0 || day.workedMinutes > 1440) issues.push({ code: "missing_hours", message: "Add valid hours worked (0–24 hours)." });
  const suspicious = [day.inTime, day.outTime].some((value) => {
    const minutes = parseClockMinutes(value);
    return minutes !== null && minutes < 240;
  });
  if (suspicious && !day.suspiciousConfirmed) issues.push({ code: "suspicious_time", message: "Confirm the early-morning time." });
  return issues;
}

export function refreshJobIssues(job: ServerJob) {
  const unresolved: ServerJob["unresolvedAttendanceIssues"] = [];
  const manualHolidays = new Set(job.manualHolidayDates ?? []);
  for (const employee of job.employees ?? []) {
    if (employee.attendanceSource === "not_uploaded") continue;
    if (!employee.matched) unresolved.push({ employeeCode: employee.employeeCode, date: null, code: "employee_mismatch", message: "Employee code and name do not match the employee list." });
    for (const day of employee.days ?? []) {
      const calendarHoliday = manualHolidays.has(day.date) || String(day.weekday ?? "").trim().toLowerCase().startsWith("su");
      if (calendarHoliday) {
        day.automaticHoliday = true;
        if (!day.inTime && !day.outTime && day.workedMinutes === null) day.workedMinutes = 0;
        const defaultedWork = Boolean(day.defaultShiftApplied && day.inTime && day.outTime && Number(day.workedMinutes ?? 0) > 0);
        day.status = defaultedWork ? "present" : "holiday";
      }
      day.issues = dayIssues(day);
      for (const issue of day.issues) unresolved.push({ employeeCode: employee.employeeCode, date: day.date, ...issue });
    }
  }
  job.unresolvedAttendanceIssues = unresolved;
  return unresolved;
}

import type { BasePayrollRow, OvertimePayrollRow } from "@/types/payroll";
import type { ServerEmployee, ServerJob } from "./model";
import { calculateBasePayroll, calculateOvertimePayroll } from "./calculations";

export function blankBase(employee: ServerEmployee): BasePayrollRow {
  return {
    employeeCode: employee.employeeCode, employeeName: employee.employeeName, attendanceSource: "not_uploaded",
    shiftHours: null, salary: null, perDay: null, salaryDivisor: null, totalAbsent: null, holiday: null,
    totalPresent: null, absentDeduction: null, totalHoursMinutes: null, actualHoursWorkedMinutes: null,
    advance: null, lateTimeMinutes: null, lateFine: null, deduction: null, netAmount: null, overriddenFields: [],
  };
}
export function blankOvertime(employee: ServerEmployee): OvertimePayrollRow {
  return {
    employeeCode: employee.employeeCode, employeeName: employee.employeeName, attendanceSource: "not_uploaded",
    shiftHours: null, newSalary: null, totalAbsent: null, holiday: null, totalPresent: null,
    totalHoursMinutes: null, perDay: null, actualHoursWorkedMinutes: null, overtimeHoursMinutes: null,
    overtimeShiftDivisor: null, overtimeTotal: null, tiffin: null, netAmountOt: null, overriddenFields: [],
  };
}
export function rebuildPayroll(job: ServerJob, overtime = job.overtimePayroll.length > 0) {
  job.basePayroll = job.employees.map((employee) => employee.attendanceSource === "not_uploaded"
    ? blankBase(employee) : calculateBasePayroll(employee, job.month, job.manualHolidayDates, job.salaryCalculationMethod));
  job.overtimePayroll = overtime ? job.employees.map((employee, index) => {
    const base = job.basePayroll[index];
    return base.attendanceSource === "not_uploaded" ? blankOvertime(employee) : calculateOvertimePayroll(employee, base);
  }) : [];
  for (const row of [...job.basePayroll, ...job.overtimePayroll]) {
    if (Object.values(row).some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("Payroll contains an invalid numeric value. Reset the affected overrides.");
    }
  }
}

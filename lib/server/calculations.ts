import type { BasePayrollResult, OvertimePayrollResult, SalaryCalculationMethod } from "@/types/payroll";
import type { ServerEmployee } from "./model";

const OT_DIVISORS: Record<number, number> = { 8: 6, 10: 6, 12: 5 };
const value = (overrides: Record<string, number>, key: string, fallback: number) => overrides[key] ?? fallback;
export const roundRupees = (amount: number) => Math.sign(amount) * Math.floor(Math.abs(amount) + 0.5);

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

const isHoliday = (day: ServerEmployee["days"][number], dates: Set<string>) =>
  day.status === "holiday" || dates.has(day.date) || String(day.weekday ?? "").toLowerCase().startsWith("su");

export function calculateBasePayroll(
  employee: ServerEmployee,
  month: string,
  manualHolidayDates: string[],
  method: SalaryCalculationMethod = "total_days",
): BasePayrollResult {
  if (employee.attendanceSource === "not_uploaded") throw new Error("Attendance has not been uploaded for this employee.");
  const overrides = employee.baseOverrides ?? {};
  const monthDays = daysInMonth(month);
  const holidays = new Set(manualHolidayDates);
  const shiftHours = value(overrides, "shiftHours", employee.shiftHours);
  const shiftMinutes = shiftHours * 60;
  const salary = value(overrides, "salary", employee.salary);
  const calculatedHolidays = employee.days.filter((day) => isHoliday(day, holidays)).length;
  const holiday = value(overrides, "holiday", calculatedHolidays);
  const salaryDivisor = method === "working_days" ? monthDays - holiday : monthDays;
  if (salaryDivisor <= 0) throw new Error("The selected month has no working days for salary calculation.");
  const perDay = value(overrides, "perDay", salary / salaryDivisor);
  const calculatedAbsent = employee.days.filter((day) => day.status === "absent" && !isHoliday(day, holidays)).length;
  const totalAbsent = value(overrides, "totalAbsent", calculatedAbsent);
  const calculatedPresent = employee.days.filter((day) => day.status === "present" && !isHoliday(day, holidays)).length;
  const totalPresent = value(overrides, "totalPresent", calculatedPresent);
  const calculatedActual = employee.days.reduce((total, day) => total + (["present", "holiday"].includes(day.status) ? Number(day.workedMinutes ?? 0) : 0), 0);
  const actualHoursWorkedMinutes = value(overrides, "actualHoursWorkedMinutes", calculatedActual);
  const calculatedLate = employee.days.reduce((total, day) =>
    day.status === "present" && !isHoliday(day, holidays) ? total + Math.max(0, shiftMinutes - Number(day.workedMinutes ?? 0)) : total, 0);
  const lateTimeMinutes = value(overrides, "lateTimeMinutes", calculatedLate);
  const totalHoursMinutes = value(overrides, "totalHoursMinutes", totalPresent * shiftMinutes);
  const absentDeduction = value(overrides, "absentDeduction", totalAbsent * perDay);
  const lateFine = value(overrides, "lateFine", shiftMinutes ? lateTimeMinutes / shiftMinutes * perDay : 0);
  const advance = value(overrides, "advance", employee.advance ?? 0);
  const deduction = value(overrides, "deduction", absentDeduction + lateFine);
  const netAmount = value(overrides, "netAmount", salary - deduction - advance);
  return {
    employeeCode: employee.employeeCode, employeeName: employee.employeeName, shiftHours,
    salary: roundRupees(salary), perDay: roundRupees(perDay), salaryDivisor, totalAbsent,
    holiday, totalPresent, absentDeduction: roundRupees(absentDeduction), totalHoursMinutes,
    actualHoursWorkedMinutes, advance: roundRupees(advance), lateTimeMinutes,
    lateFine: roundRupees(lateFine), deduction: roundRupees(deduction), netAmount: roundRupees(netAmount),
    overriddenFields: Object.keys(overrides).sort(),
  };
}

export function calculateOvertimePayroll(employee: ServerEmployee, base: BasePayrollResult): OvertimePayrollResult {
  const overrides = employee.overtimeOverrides ?? {};
  const shiftHours = value(overrides, "shiftHours", base.shiftHours);
  const divisor = Number.isInteger(shiftHours) ? OT_DIVISORS[shiftHours] : undefined;
  if (!divisor) throw new Error(`No overtime divisor is configured for a ${shiftHours}-hour shift.`);
  const shiftMinutes = shiftHours * 60;
  const calculatedOvertime = employee.days.reduce((total, day) => {
    if (day.workedMinutes === null || !["present", "holiday"].includes(day.status)) return total;
    const excess = day.workedMinutes - shiftMinutes;
    return total + (excess > 15 ? excess : 0);
  }, 0);
  const newSalary = value(overrides, "newSalary", base.salary);
  const totalAbsent = value(overrides, "totalAbsent", base.totalAbsent);
  const holiday = value(overrides, "holiday", base.holiday);
  const totalPresent = value(overrides, "totalPresent", base.totalPresent);
  const totalHoursMinutes = base.totalHoursMinutes;
  const actualHoursWorkedMinutes = value(overrides, "actualHoursWorkedMinutes", base.actualHoursWorkedMinutes);
  const calculatedPerDay = employee.baseOverrides?.perDay ?? (employee.baseOverrides?.salary ?? employee.salary) / base.salaryDivisor;
  const perDay = value(overrides, "perDay", calculatedPerDay);
  const overtimeHoursMinutes = value(overrides, "overtimeHoursMinutes", calculatedOvertime);
  const overtimeShiftDivisor = value(overrides, "overtimeShiftDivisor", divisor);
  const overtimeTotal = value(overrides, "overtimeTotal", overtimeShiftDivisor ? overtimeHoursMinutes / 60 / overtimeShiftDivisor * perDay : 0);
  const tiffin = value(overrides, "tiffin", shiftHours > 8 ? totalPresent * 10 : 0);
  const netAmountOt = value(overrides, "netAmountOt", overtimeTotal + tiffin);
  return {
    employeeCode: employee.employeeCode, employeeName: employee.employeeName, shiftHours,
    newSalary: roundRupees(newSalary), totalAbsent, holiday, totalPresent, totalHoursMinutes,
    perDay: roundRupees(perDay), actualHoursWorkedMinutes, overtimeHoursMinutes, overtimeShiftDivisor,
    overtimeTotal: roundRupees(overtimeTotal), tiffin: roundRupees(tiffin), netAmountOt: roundRupees(netAmountOt),
    overriddenFields: [...new Set([...Object.keys(overrides), ...base.overriddenFields
      .filter((field) => ["shiftHours", "salary", "totalAbsent", "holiday", "totalPresent", "totalHoursMinutes", "perDay", "actualHoursWorkedMinutes"].includes(field))
      .map((field) => field === "salary" ? "newSalary" : field)])].sort(),
  };
}

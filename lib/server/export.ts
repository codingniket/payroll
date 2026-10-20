import * as XLSX from "@e965/xlsx";
import type { BasePayrollRow, OvertimePayrollRow } from "@/types/payroll";
import { formatMinutes } from "./time";

function workbook(title: string, headers: string[], rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
  sheet["!cols"] = headers.map((header, index) => ({ wch: Math.min(24, Math.max(12, header.length + 2, ...rows.map((row) => String(row[index] ?? "").length + 2))) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, title);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function exportBase(results: BasePayrollRow[]) {
  const headers = ["Employee Code", "Employee Name", "Shift Hours", "Salary", "Per Day", "Absent", "Holiday", "Present", "Absent Deduction", "Total Hours", "Actual Hours", "Advance", "Late Time", "LT Fine", "Deduction", "Net Amount"];
  return workbook("Base Payroll", headers, results.map((r) => r.attendanceSource === "not_uploaded"
    ? [r.employeeCode, r.employeeName, ...Array(headers.length - 2).fill(null)]
    : [r.employeeCode, r.employeeName, r.shiftHours, r.salary, r.perDay, r.totalAbsent, r.holiday, r.totalPresent, r.absentDeduction, formatMinutes(r.totalHoursMinutes), formatMinutes(r.actualHoursWorkedMinutes), r.advance, formatMinutes(r.lateTimeMinutes), r.lateFine, r.deduction, r.netAmount]));
}

export function exportOvertime(results: OvertimePayrollRow[]) {
  const headers = ["Employee Code", "Employee Name", "Shift Hours", "New Salary", "Absent", "Holiday", "Present", "Total Hours", "Per Day", "Actual Hours", "Overtime Hours", "OT Divisor", "Overtime Total", "Tiffin", "Net Amount OT"];
  return workbook("Overtime Payroll", headers, results.map((r) => r.attendanceSource === "not_uploaded"
    ? [r.employeeCode, r.employeeName, ...Array(headers.length - 2).fill(null)]
    : [r.employeeCode, r.employeeName, r.shiftHours, r.newSalary, r.totalAbsent, r.holiday, r.totalPresent, formatMinutes(r.totalHoursMinutes), r.perDay, formatMinutes(r.actualHoursWorkedMinutes), formatMinutes(r.overtimeHoursMinutes), r.overtimeShiftDivisor, r.overtimeTotal, r.tiffin, r.netAmountOt]));
}

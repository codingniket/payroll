import type { PayrollChanges } from "@/types/payroll";
import type { ServerEmployee, ServerJob } from "./model";
import { calculateBasePayroll } from "./calculations";

export const sharedFields = ["shiftHours", "salary", "perDay", "totalAbsent", "holiday", "totalPresent", "totalHoursMinutes", "actualHoursWorkedMinutes"];
export const baseFields = [...sharedFields, "absentDeduction", "advance", "lateTimeMinutes", "lateFine", "deduction", "netAmount"];
export const overtimeFields = [...sharedFields.filter((key) => key !== "salary"), "newSalary", "overtimeHoursMinutes", "overtimeShiftDivisor", "overtimeTotal", "tiffin", "netAmountOt"];
const otOnly = new Set(["overtimeHoursMinutes", "overtimeShiftDivisor", "overtimeTotal", "tiffin", "netAmountOt"]);

// Dependency edges also control which older manual totals cease to be authoritative.
const dependencies: Record<string, string[]> = {
  salary: ["perDay", "netAmount"], salaryMethod: ["perDay"],
  perDay: ["absentDeduction", "lateFine", "overtimeTotal"],
  shiftHours: ["totalHoursMinutes", "lateTimeMinutes", "lateFine", "overtimeHoursMinutes", "overtimeShiftDivisor", "tiffin"],
  totalAbsent: ["absentDeduction"],
  totalPresent: ["totalHoursMinutes", "tiffin"],
  holiday: ["perDay"],
  absentDeduction: ["deduction"], lateTimeMinutes: ["lateFine"], lateFine: ["deduction"],
  deduction: ["netAmount"], advance: ["netAmount"],
  overtimeHoursMinutes: ["overtimeTotal"], overtimeShiftDivisor: ["overtimeTotal"],
  overtimeTotal: ["netAmountOt"], tiffin: ["netAmountOt"],
  attendance: ["totalPresent", "totalAbsent", "holiday", "actualHoursWorkedMinutes", "lateTimeMinutes", "overtimeHoursMinutes"],
};

export function invalidateDependents(employee: ServerEmployee, changed: string[]) {
  const visited = new Set<string>();
  const visit = (field: string) => {
    for (const child of dependencies[field] ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      delete (otOnly.has(child) ? employee.overtimeOverrides : employee.baseOverrides)[child];
      visit(child);
    }
  };
  changed.forEach(visit);
}

export function validateChanges(input: unknown, kind: "base" | "overtime", monthDays: number): PayrollChanges {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Payroll changes must be an object.");
  const entries = Object.entries(input);
  if (!entries.length) throw new Error("No payroll changes were supplied.");
  const allowed = kind === "base" ? baseFields : overtimeFields;
  for (const [key, value] of entries) {
    if (!allowed.includes(key)) throw new Error(`Unknown payroll field: ${key}.`);
    if (value === null) continue; // Explicit reset.
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new Error(`${key} must be a valid number.`);
    if (!["netAmount", "netAmountOt"].includes(key) && value < 0) throw new Error(`${key} cannot be negative.`);
    if (key === "shiftHours" && ![8, 10, 12].includes(value)) throw new Error("Shift hours must be 8, 10, or 12.");
    if (key === "overtimeShiftDivisor" && value <= 0) throw new Error("OT divisor must be greater than zero.");
    if (["totalPresent", "totalAbsent", "holiday"].includes(key) && (!Number.isInteger(value) || value > monthDays)) throw new Error(`${key} must be a whole number within the month.`);
    if (key.endsWith("Minutes") && (!Number.isInteger(value) || value > monthDays * 1440)) throw new Error(`${key} must be whole minutes within the month.`);
  }
  return Object.fromEntries(entries) as PayrollChanges;
}

export function applyPayrollChanges(employee: ServerEmployee, job: ServerJob, kind: "base" | "overtime", input: unknown) {
  if (employee.attendanceSource === "not_uploaded") throw new Error("Upload attendance before editing this employee's payroll.");
  const changes = validateChanges(input, kind, employee.daysInMonth);
  if ("newSalary" in changes) { changes.salary = changes.newSalary; delete changes.newSalary; }
  const before = calculateBasePayroll(employee, job.month, job.manualHolidayDates, job.salaryCalculationMethod);
  const has = (key: string) => Object.hasOwn(changes, key);
  const countsChanged = ["holiday", "totalPresent", "totalAbsent"].some(has);

  if (countsChanged) {
    const natural = calculateBasePayroll({ ...employee, baseOverrides: {} }, job.month, job.manualHolidayDates, job.salaryCalculationMethod);
    const holiday = changes.holiday === null ? natural.holiday : changes.holiday ?? before.holiday;
    let present = changes.totalPresent === null ? natural.totalPresent : changes.totalPresent ?? before.totalPresent;
    let absent = changes.totalAbsent === null ? natural.totalAbsent : changes.totalAbsent ?? before.totalAbsent;
    if (has("holiday") && changes.holiday !== null) {
      if (typeof changes.totalPresent !== "number" || typeof changes.totalAbsent !== "number") {
        throw new Error("Adjust Present and Absent together when changing Holidays.");
      }
    } else if (changes.holiday === null) {
      present = natural.totalPresent; absent = natural.totalAbsent;
      changes.totalPresent = null; changes.totalAbsent = null;
    } else if (has("totalPresent") && !has("totalAbsent")) absent = employee.daysInMonth - holiday - present;
    else if (has("totalAbsent") && !has("totalPresent")) present = employee.daysInMonth - holiday - absent;
    if (present < 0 || absent < 0 || present + absent + holiday !== employee.daysInMonth) {
      throw new Error(`Present + Absent + Holidays must equal ${employee.daysInMonth}.`);
    }
    if (changes.holiday !== null) {
      if (changes.totalPresent !== null) changes.totalPresent = present;
      if (changes.totalAbsent !== null) changes.totalAbsent = absent;
    }
  }
  invalidateDependents(employee, Object.keys(changes));
  // Explicit changes in this request take precedence over dependency invalidation.
  for (const [field, value] of Object.entries(changes)) {
    const overrides = otOnly.has(field) ? employee.overtimeOverrides : employee.baseOverrides;
    if (value === null) delete overrides[field]; else overrides[field] = value;
  }
}

export function normalizeLegacyOverrides(employee: ServerEmployee) {
  employee.baseOverrides ??= {};
  employee.overtimeOverrides ??= {};
  for (const field of sharedFields) {
    const oldField = field === "salary" ? "newSalary" : field;
    const legacy = employee.overtimeOverrides[oldField];
    if (legacy !== undefined && employee.baseOverrides[field] === undefined) employee.baseOverrides[field] = legacy;
    delete employee.overtimeOverrides[oldField];
  }
}

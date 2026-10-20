import type { EmployeeMasterRecord } from "@/types/payroll";
import type { ServerEmployee, StoredEmployee } from "./model";

type EmployeeInput = object;

function employeeValue(employee: EmployeeInput, ...keys: string[]) {
  const values = new Map(Object.entries(employee).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) if (values.has(key.toLowerCase())) return values.get(key.toLowerCase());
  return undefined;
}

export function canonicalEmployee(employee: EmployeeInput): EmployeeMasterRecord {
  return {
    employeeCode: String(employeeValue(employee, "employee_code", "employeeCode", "code") ?? "").trim(),
    name: String(employeeValue(employee, "name", "employee_name", "employeeName") ?? "").trim(),
    salary: Number(employeeValue(employee, "salary")),
    shiftHours: Number(employeeValue(employee, "shift_hours", "shiftHours")) as 8 | 10 | 12,
  };
}

export function employeeForStorage(employee: EmployeeInput): StoredEmployee {
  const value = canonicalEmployee(employee);
  return { employee_code: value.employeeCode, name: value.name, salary: value.salary, shift_hours: value.shiftHours };
}

export function validateEmployee(payload: EmployeeInput, existing: EmployeeInput[], originalCode?: string) {
  const employee = canonicalEmployee(payload);
  if (!employee.employeeCode) throw new Error("Employee ID is required.");
  if (!employee.name) throw new Error("Employee name is required.");
  if (existing.some((item) => {
    const code = canonicalEmployee(item).employeeCode;
    return code === employee.employeeCode && code !== originalCode;
  })) throw new Error("Employee ID already exists.");
  if (!Number.isFinite(employee.salary) || employee.salary < 0) throw new Error("Salary must be a valid non-negative amount.");
  if (![8, 10, 12].includes(employee.shiftHours) || !Number.isInteger(employee.shiftHours)) throw new Error("Shift hours must be 8, 10, or 12.");
  return employee;
}

const normalizeName = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function matchEmployees(parsed: ServerEmployee[], master: EmployeeInput[]) {
  const byCode = new Map(master.map((item) => [canonicalEmployee(item).employeeCode, canonicalEmployee(item)]));
  for (const employee of parsed) {
    const record = byCode.get(String(employee.employeeCode).trim());
    employee.matched = Boolean(record && normalizeName(record.name) === normalizeName(employee.employeeName));
    if (employee.matched && record) {
      employee.employeeName = record.name;
      employee.salary = record.salary;
      employee.shiftHours = record.shiftHours;
    }
  }
}

export function reconcileEmployees(parsed: ServerEmployee[], master: EmployeeInput[], month: string) {
  const masterCodes = new Set(master.map((item) => canonicalEmployee(item).employeeCode));
  const employees = parsed.filter((employee) => employee.attendanceSource !== "not_uploaded" || masterCodes.has(employee.employeeCode));
  const codes = new Set<string>();
  for (const employee of employees) {
    if (codes.has(employee.employeeCode)) throw new Error(`Duplicate employee code: ${employee.employeeCode}.`);
    codes.add(employee.employeeCode);
    employee.attendanceSource ??= "uploaded";
  }
  matchEmployees(employees, master);
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  for (const item of master) {
    const record = canonicalEmployee(item);
    if (codes.has(record.employeeCode)) continue;
    employees.push({
      employeeCode: record.employeeCode, employeeName: record.name, salary: record.salary,
      shiftHours: record.shiftHours, matched: true, daysInMonth, days: [],
      advance: 0, baseOverrides: {}, overtimeOverrides: {}, attendanceSource: "not_uploaded",
    });
    codes.add(record.employeeCode);
  }
  return employees;
}

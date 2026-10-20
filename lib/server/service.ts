import path from "node:path";
import type { EmployeeMasterRecord, PayrollVersion, SalaryCalculationMethod } from "@/types/payroll";
import { applyDefaultShift } from "./attendance";
import { calculateBasePayroll } from "./calculations";
import { canonicalEmployee, employeeForStorage, reconcileEmployees, validateEmployee } from "./employees";
import type { ServerEmployee, ServerJob } from "./model";
import { applyPayrollMonth, parseAttendanceFile, validateHolidayDates } from "./parser";
import { applyPayrollChanges, invalidateDependents, normalizeLegacyOverrides } from "./payroll-rules";
import { rebuildPayroll } from "./payroll-results";
import { store, withStoreLock } from "./store";
import { parseClockMinutes, workedMinutesFromPunches } from "./time";
import { refreshJobIssues } from "./validation";

export class HttpError extends Error {
  constructor(message: string, public status = 400, public issues?: unknown[]) { super(message); }
}

export function checkVersion(job: ServerJob, version: Partial<PayrollVersion>) {
  if (version.jobId !== job.jobId || version.revision !== job.revision) {
    throw new HttpError("Payroll changed in another tab or request. Reload the latest payroll before saving or downloading.", 409);
  }
}

function requireReady(job: ServerJob) {
  const issues = refreshJobIssues(job);
  if (issues.length) throw new HttpError("Resolve the highlighted attendance before calculating payroll.", 422, issues);
}

// Called inside the store lock. GET normalization does not persist or overwrite edits.
async function readCurrent() {
  const job = await store.loadJob();
  if (!job) throw new HttpError("No payroll is in progress.", 404);
  job.revision ??= 0;
  job.salaryCalculationMethod ??= "total_days";
  try {
    applyPayrollMonth({ month: job.month, employees: job.employees.filter((employee) => employee.attendanceSource !== "not_uploaded") }, job.month);
    job.employees = reconcileEmployees(job.employees, await store.loadEmployees(), job.month);
    job.employees.forEach(normalizeLegacyOverrides);
    if (refreshJobIssues(job).length) { job.basePayroll = []; job.overtimePayroll = []; }
    else if (job.basePayroll.length) rebuildPayroll(job);
  } catch (error) { throw new HttpError((error as Error).message, 422); }
  return job;
}

export const currentJob = () => withStoreLock(readCurrent);

async function mutateJob(version: Partial<PayrollVersion>, operation: (job: ServerJob) => void) {
  return withStoreLock(async () => {
    const job = await readCurrent();
    checkVersion(job, version);
    try { operation(job); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError((error as Error).message, 422);
    }
    job.revision += 1;
    await store.saveJob(job);
    return job;
  });
}

function findEmployee(job: ServerJob, code: string): ServerEmployee {
  const employee = job.employees.find((item) => item.employeeCode === code);
  if (!employee) throw new HttpError("Employee was not found.", 404);
  if (employee.attendanceSource === "not_uploaded") throw new HttpError("Attendance has not been uploaded for this employee.", 422);
  return employee;
}

export async function uploadJob(file: File | null, payrollMonth: string, holidayJson: string) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.name) throw new HttpError("Choose an attendance file.");
  const extension = path.extname(file.name).toLowerCase();
  if (![".xls", ".xlsx", ".pdf"].includes(extension)) throw new HttpError("Upload an XLS, XLSX, or PDF attendance file.");
  if (payrollMonth && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(payrollMonth)) throw new HttpError("Choose a valid payroll month.");
  let holidays: unknown;
  try { holidays = JSON.parse(holidayJson || "[]"); } catch { throw new HttpError("Holiday dates are invalid."); }
  if (!Array.isArray(holidays)) throw new HttpError("Holiday dates are invalid.");
  let parsed;
  try {
    parsed = await parseAttendanceFile(Buffer.from(await file.arrayBuffer()), extension, payrollMonth || undefined);
    applyPayrollMonth(parsed, payrollMonth || parsed.month);
    holidays = validateHolidayDates(holidays, parsed.month);
  } catch (error) { throw new HttpError((error as Error).message, 422); }
  return withStoreLock(async () => {
    let employees;
    try { employees = reconcileEmployees(parsed.employees, await store.loadEmployees(), parsed.month); }
    catch (error) { throw new HttpError((error as Error).message, 422); }
    const job: ServerJob = {
      jobId: crypto.randomUUID(), revision: 1, month: parsed.month, sourceFileName: path.basename(file.name),
      manualHolidayDates: holidays as string[], salaryCalculationMethod: "total_days", employees,
      basePayroll: [], overtimePayroll: [], unresolvedAttendanceIssues: [],
    };
    refreshJobIssues(job);
    await store.saveJob(job);
    return job;
  });
}

export function updateAttendance(payload: Record<string, unknown>, version: Partial<PayrollVersion>) {
  return mutateJob(version, (job) => {
    const employee = findEmployee(job, String(payload.employeeCode ?? ""));
    const day = employee.days.find((item) => item.date === payload.date);
    if (!day) throw new HttpError("Attendance date was not found.", 404);
    for (const field of ["inTime", "outTime"] as const) {
      if (!(field in payload)) continue;
      const value = payload[field];
      if (value !== null && (typeof value !== "string" || parseClockMinutes(value) === null)) throw new HttpError("Enter valid clock times.");
      day[field] = value;
    }
    if ("status" in payload) {
      if (!["present", "absent", "holiday"].includes(String(payload.status))) throw new HttpError("Choose Present, Absent, or Holiday.");
      day.status = payload.status as typeof day.status;
    }
    if ("suspiciousConfirmed" in payload) {
      if (typeof payload.suspiciousConfirmed !== "boolean") throw new HttpError("Time confirmation must be true or false.");
      day.suspiciousConfirmed = payload.suspiciousConfirmed;
    } else if ("inTime" in payload || "outTime" in payload) day.suspiciousConfirmed = false;
    if ("workedMinutes" in payload) {
      const value = payload.workedMinutes;
      if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1440)) throw new HttpError("Worked time must be 0–24 hours.");
      day.workedMinutes = value as number | null; day.hoursOverridden = true;
    } else if ("inTime" in payload || "outTime" in payload) {
      day.workedMinutes = workedMinutesFromPunches(day.inTime, day.outTime); day.hoursOverridden = false;
    }
    invalidateDependents(employee, ["attendance"]);
    job.basePayroll = []; job.overtimePayroll = []; refreshJobIssues(job);
  });
}

export function defaultShift(employeeCode: string, version: Partial<PayrollVersion>) {
  return mutateJob(version, (job) => {
    const employee = findEmployee(job, employeeCode);
    applyDefaultShift(employee); invalidateDependents(employee, ["attendance"]);
    job.basePayroll = []; job.overtimePayroll = []; refreshJobIssues(job);
  });
}

export function calculateBase(method: SalaryCalculationMethod, version: Partial<PayrollVersion>) {
  if (!["total_days", "working_days"].includes(method)) throw new HttpError("Choose a valid salary calculation method.");
  return mutateJob(version, (job) => {
    requireReady(job);
    if (job.salaryCalculationMethod !== method) job.employees.forEach((employee) => invalidateDependents(employee, ["salaryMethod"]));
    job.salaryCalculationMethod = method;
    rebuildPayroll(job);
  });
}

export async function compareMethods() {
  const job = await currentJob();
  requireReady(job);
  const total = (method: SalaryCalculationMethod) => job.employees.reduce((sum, employee) => {
    if (employee.attendanceSource === "not_uploaded") return sum;
    const copy = structuredClone(employee);
    if (method !== job.salaryCalculationMethod) invalidateDependents(copy, ["salaryMethod"]);
    return sum + calculateBasePayroll(copy, job.month, job.manualHolidayDates, method).netAmount;
  }, 0);
  const totalDaysNetPayroll = total("total_days"), workingDaysNetPayroll = total("working_days");
  return { totalDaysNetPayroll, workingDaysNetPayroll, difference: workingDaysNetPayroll - totalDaysNetPayroll };
}

function updatePayroll(kind: "base" | "overtime", employeeCode: string, changes: unknown, version: Partial<PayrollVersion>) {
  return mutateJob(version, (job) => {
    requireReady(job);
    if (!job.basePayroll.length) throw new HttpError("Calculate base payroll first.", 409);
    applyPayrollChanges(findEmployee(job, employeeCode), job, kind, changes);
    rebuildPayroll(job, kind === "overtime" || job.overtimePayroll.length > 0);
  });
}
export const updateBase = (code: string, changes: unknown, version: Partial<PayrollVersion>) => updatePayroll("base", code, changes, version);
export const updateOvertime = (code: string, changes: unknown, version: Partial<PayrollVersion>) => updatePayroll("overtime", code, changes, version);

export function calculateOvertime(version: Partial<PayrollVersion>) {
  return mutateJob(version, (job) => {
    requireReady(job);
    if (!job.basePayroll.length) throw new HttpError("Calculate base payroll first.", 409);
    rebuildPayroll(job, true);
  });
}

export function exitJob(version: Partial<PayrollVersion>) {
  return withStoreLock(async () => {
    const job = await readCurrent(); checkVersion(job, version); await store.clearJob();
  });
}

async function syncActivePayroll(oldCode?: string, updated?: EmployeeMasterRecord) {
  const job = await store.loadJob();
  if (!job) return "unchanged" as const;
  job.revision = (job.revision ?? 0) + 1;
  job.salaryCalculationMethod ??= "total_days";
  for (const employee of job.employees) {
    normalizeLegacyOverrides(employee);
    if (employee.employeeCode === oldCode && updated) {
      employee.employeeCode = updated.employeeCode; employee.employeeName = updated.name;
      employee.baseOverrides = {}; employee.overtimeOverrides = {};
    }
  }
  job.employees = reconcileEmployees(job.employees, await store.loadEmployees(), job.month);
  const hadBase = job.basePayroll.length > 0;
  if (refreshJobIssues(job).length) {
    job.basePayroll = []; job.overtimePayroll = [];
    await store.saveJob(job); return "invalidated" as const;
  }
  if (hadBase) rebuildPayroll(job);
  await store.saveJob(job);
  return hadBase ? "recalculated" as const : "updated" as const;
}

export const listEmployees = () => withStoreLock(async () => ({
  employees: (await store.loadEmployees()).map(canonicalEmployee), payrollStatus: "unchanged" as const,
}));

export const createEmployee = (payload: Record<string, unknown>) => withStoreLock(async () => {
  const employees = await store.loadEmployees();
  let employee: EmployeeMasterRecord;
  try { employee = validateEmployee(payload, employees); } catch (error) { throw new HttpError((error as Error).message); }
  employees.push(employeeForStorage(employee)); await store.saveEmployees(employees);
  const payrollStatus = await syncActivePayroll();
  return { employees: employees.map(canonicalEmployee), payrollStatus };
});

export const updateEmployee = (originalCode: string, payload: Record<string, unknown>) => withStoreLock(async () => {
  const employees = await store.loadEmployees();
  const index = employees.findIndex((item) => canonicalEmployee(item).employeeCode === originalCode);
  if (index < 0) throw new HttpError("Employee was not found.", 404);
  let employee: EmployeeMasterRecord;
  try { employee = validateEmployee(payload, employees, originalCode); } catch (error) { throw new HttpError((error as Error).message); }
  const activeJob = await store.loadJob();
  if (employee.employeeCode !== originalCode && activeJob?.employees.some((item) => item.employeeCode === employee.employeeCode)) {
    throw new HttpError("That employee code already appears in the active attendance. Finish or replace this payroll before renaming the employee to that code.", 409);
  }
  employees[index] = employeeForStorage(employee); await store.saveEmployees(employees);
  const payrollStatus = await syncActivePayroll(originalCode, employee);
  return { employees: employees.map(canonicalEmployee), payrollStatus };
});

export const deleteEmployee = (employeeCode: string) => withStoreLock(async () => {
  const employees = await store.loadEmployees();
  const index = employees.findIndex((item) => canonicalEmployee(item).employeeCode === employeeCode);
  if (index < 0) throw new HttpError("Employee was not found.", 404);
  employees.splice(index, 1); await store.saveEmployees(employees);
  const payrollStatus = await syncActivePayroll();
  return { employees: employees.map(canonicalEmployee), payrollStatus };
});

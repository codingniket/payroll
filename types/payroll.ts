export type AttendanceStatus = "present" | "absent" | "holiday" | "missing" | "unknown";
export type SalaryCalculationMethod = "total_days" | "working_days";

export interface SalaryMethodComparison {
  totalDaysNetPayroll: number;
  workingDaysNetPayroll: number;
  difference: number;
}

export interface EmployeeMasterRecord {
  employeeCode: string;
  name: string;
  salary: number;
  shiftHours: 8 | 10 | 12;
}

export interface EmployeeMasterResponse {
  employees: EmployeeMasterRecord[];
  payrollStatus: "unchanged" | "updated" | "recalculated" | "invalidated";
}

export interface AttendanceIssue {
  code: string;
  message: string;
}

export interface AttendanceDay {
  date: string;
  day: number;
  weekday: string;
  inTime: string | null;
  outTime: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus;
  sourceStatus: string;
  suspiciousConfirmed: boolean;
  hoursOverridden: boolean;
  issues: AttendanceIssue[];
}

export interface PayrollEmployee {
  attendanceSource?: "uploaded" | "not_uploaded";
  employeeCode: string;
  employeeName: string;
  matched: boolean;
  salary: number;
  shiftHours: number;
  advance: number;
  baseOverrides: Record<string, number>;
  overtimeOverrides: Record<string, number>;
  days: AttendanceDay[];
}

export interface BasePayrollResult {
  attendanceSource?: "uploaded";
  employeeCode: string;
  employeeName: string;
  shiftHours: number;
  salary: number;
  perDay: number;
  salaryDivisor: number;
  totalAbsent: number;
  holiday: number;
  totalPresent: number;
  absentDeduction: number;
  totalHoursMinutes: number;
  actualHoursWorkedMinutes: number;
  advance: number;
  lateTimeMinutes: number;
  lateFine: number;
  deduction: number;
  netAmount: number;
  overriddenFields: string[];
}

export interface OvertimePayrollResult {
  attendanceSource?: "uploaded";
  employeeCode: string;
  employeeName: string;
  shiftHours: number;
  newSalary: number;
  totalAbsent: number;
  holiday: number;
  totalPresent: number;
  totalHoursMinutes: number;
  perDay: number;
  actualHoursWorkedMinutes: number;
  overtimeHoursMinutes: number;
  overtimeShiftDivisor: number;
  overtimeTotal: number;
  tiffin: number;
  netAmountOt: number;
  overriddenFields: string[];
}

export type BlankPayrollResult<T> = {
  [K in keyof Omit<T, "attendanceSource">]: T[K] extends number ? null : T[K];
} & { attendanceSource: "not_uploaded" };
export type BasePayrollRow = BasePayrollResult | BlankPayrollResult<BasePayrollResult>;
export type OvertimePayrollRow = OvertimePayrollResult | BlankPayrollResult<OvertimePayrollResult>;
export interface PayrollVersion { jobId: string; revision: number }
export type PayrollChanges = Record<string, number | null>;

export interface PayrollJob {
  jobId: string;
  revision: number;
  month: string;
  sourceFileName: string;
  manualHolidayDates: string[];
  salaryCalculationMethod: SalaryCalculationMethod;
  employees: PayrollEmployee[];
  unresolvedAttendanceIssues: Array<AttendanceIssue & { employeeCode: string; date: string | null }>;
  basePayroll: BasePayrollRow[];
  overtimePayroll: OvertimePayrollRow[];
}

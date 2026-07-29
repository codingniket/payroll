export type AttendanceStatus = "present" | "absent" | "holiday" | "missing" | "unknown";

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
  employeeCode: string;
  employeeName: string;
  shiftHours: number;
  salary: number;
  perDay: number;
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

export interface PayrollJob {
  jobId: string;
  month: string;
  sourceFileName: string;
  manualHolidayDates: string[];
  employees: PayrollEmployee[];
  unresolvedAttendanceIssues: Array<AttendanceIssue & { employeeCode: string; date: string | null }>;
  basePayroll: BasePayrollResult[];
  overtimePayroll: OvertimePayrollResult[];
}

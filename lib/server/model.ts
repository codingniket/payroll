import type { AttendanceDay, BasePayrollResult, PayrollEmployee, PayrollJob } from "@/types/payroll";

export type ServerDay = AttendanceDay & Record<string, unknown>;
export type ServerEmployee = Omit<PayrollEmployee, "days"> & {
  sourceSummary?: string;
  daysInMonth: number;
  days: ServerDay[];
  manualBasePayroll?: Omit<BasePayrollResult, "employeeCode" | "employeeName" | "overriddenFields" | "manualEntry" | "attendanceSource">;
};
export type ServerJob = Omit<PayrollJob, "employees"> & { employees: ServerEmployee[] };
export type StoredEmployee = {
  employee_code: string;
  name: string;
  salary: number;
  shift_hours: 8 | 10 | 12;
};

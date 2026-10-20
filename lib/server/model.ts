import type { AttendanceDay, PayrollEmployee, PayrollJob } from "@/types/payroll";

export type ServerDay = AttendanceDay & Record<string, unknown>;
export type ServerEmployee = Omit<PayrollEmployee, "days"> & {
  sourceSummary?: string;
  daysInMonth: number;
  days: ServerDay[];
};
export type ServerJob = Omit<PayrollJob, "employees"> & { employees: ServerEmployee[] };
export type StoredEmployee = {
  employee_code: string;
  name: string;
  salary: number;
  shift_hours: 8 | 10 | 12;
};

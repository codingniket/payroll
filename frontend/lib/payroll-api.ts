import type { PayrollJob } from "@/types/payroll";

const API_URL = process.env.NEXT_PUBLIC_PAYROLL_API_URL ?? "http://localhost:5000/api/payroll";

export class PayrollApiError extends Error {
  constructor(message: string, public issues: unknown[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Payroll could not be completed." }));
    throw new PayrollApiError(payload.message, payload.issues);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const payrollApi = {
  current: () => request<PayrollJob>("/current"),
  upload: (file: File, manualHolidayDates: string[]) => {
    const data = new FormData();
    data.append("file", file);
    data.append("manualHolidayDates", JSON.stringify(manualHolidayDates));
    return request<PayrollJob>("/upload", { method: "POST", body: data });
  },
  updateAttendance: (payload: Record<string, unknown>) =>
    request<PayrollJob>("/current/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  applyDefaultShift: (employeeCode: string) =>
    request<PayrollJob>("/current/attendance/default-shift", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode }),
    }),
  calculateBase: () => request<PayrollJob>("/current/base/calculate", { method: "POST" }),
  updateBase: (employeeCode: string, overrides: Record<string, number>) =>
    request<PayrollJob>(`/current/base/${encodeURIComponent(employeeCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    }),
  calculateOvertime: () => request<PayrollJob>("/current/overtime/calculate", { method: "POST" }),
  updateOvertime: (employeeCode: string, overrides: Record<string, number>) =>
    request<PayrollJob>(`/current/overtime/${encodeURIComponent(employeeCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    }),
  exit: () => request<void>("/current/exit", { method: "POST" }),
  downloadUrl: (kind: "base" | "overtime") => `${API_URL}/current/export/${kind}`,
};

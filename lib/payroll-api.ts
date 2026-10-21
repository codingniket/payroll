import type {
  EmployeeMasterRecord,
  EmployeeMasterResponse,
  PayrollJob,
  PayrollVersion,
  PayrollChanges,
  SalaryCalculationMethod,
  SalaryMethodComparison,
} from "@/types/payroll";

const API_URL = process.env.NEXT_PUBLIC_PAYROLL_API_URL ?? "/api/payroll";
const EMPLOYEES_API_URL =
  process.env.NEXT_PUBLIC_EMPLOYEES_API_URL ?? API_URL.replace(/\/payroll\/?$/, "/employees");

export class PayrollApiError extends Error {
  constructor(message: string, public issues: unknown[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestFrom<T>(API_URL, path, init);
}

async function requestFrom<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Payroll could not be completed." }));
    throw new PayrollApiError(payload.message, payload.issues);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const payrollApi = {
  current: () => request<PayrollJob>("/current"),
  upload: (file: File, payrollMonth: string, manualHolidayDates: string[]) => {
    const data = new FormData();
    data.append("file", file);
    data.append("payrollMonth", payrollMonth);
    data.append("manualHolidayDates", JSON.stringify(manualHolidayDates));
    return request<PayrollJob>("/upload", { method: "POST", body: data });
  },
  updateAttendance: (payload: Record<string, unknown>, version: PayrollVersion) =>
    request<PayrollJob>("/current/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, jobId: version.jobId, revision: version.revision }),
    }),
  applyDefaultShift: (employeeCode: string, version: PayrollVersion) =>
    request<PayrollJob>("/current/attendance/default-shift", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode, jobId: version.jobId, revision: version.revision }),
    }),
  calculateBase: (salaryCalculationMethod: SalaryCalculationMethod, version: PayrollVersion) =>
    request<PayrollJob>("/current/base/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salaryCalculationMethod, jobId: version.jobId, revision: version.revision }),
    }),
  compareSalaryMethods: () => request<SalaryMethodComparison>("/current/base/comparison"),
  updateBase: (employeeCode: string, changes: PayrollChanges, version: PayrollVersion) =>
    request<PayrollJob>(`/current/base/${encodeURIComponent(employeeCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, jobId: version.jobId, revision: version.revision }),
    }),
  startManualBase: (employeeCode: string, version: PayrollVersion) =>
    request<PayrollJob>("/current/base/manual", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode, jobId: version.jobId, revision: version.revision }),
    }),
  updateManualBase: (employeeCode: string, changes: PayrollChanges, version: PayrollVersion) =>
    request<PayrollJob>(`/current/base/manual/${encodeURIComponent(employeeCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, jobId: version.jobId, revision: version.revision }),
    }),
  calculateOvertime: (version: PayrollVersion) => request<PayrollJob>("/current/overtime/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: version.jobId, revision: version.revision }) }),
  updateOvertime: (employeeCode: string, changes: PayrollChanges, version: PayrollVersion) =>
    request<PayrollJob>(`/current/overtime/${encodeURIComponent(employeeCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, jobId: version.jobId, revision: version.revision }),
    }),
  exit: (version: PayrollVersion) => request<void>("/current/exit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: version.jobId, revision: version.revision }) }),
  async download(kind: "base" | "overtime", version: PayrollVersion) {
    const query = new URLSearchParams({ jobId: version.jobId, revision: String(version.revision) });
    const response = await fetch(`${API_URL}/current/export/${kind}?${query}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: "The workbook could not be downloaded." }));
      throw new PayrollApiError(body.message);
    }
    return response.blob();
  },
};

export const employeesApi = {
  list: () => requestFrom<EmployeeMasterResponse>(EMPLOYEES_API_URL, ""),
  create: (employee: EmployeeMasterRecord) =>
    requestFrom<EmployeeMasterResponse>(EMPLOYEES_API_URL, "", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employee),
    }),
  update: (originalCode: string, employee: EmployeeMasterRecord) =>
    requestFrom<EmployeeMasterResponse>(
      EMPLOYEES_API_URL,
      `/${encodeURIComponent(originalCode)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employee),
      },
    ),
  delete: (employeeCode: string) =>
    requestFrom<EmployeeMasterResponse>(
      EMPLOYEES_API_URL,
      `/${encodeURIComponent(employeeCode)}`,
      { method: "DELETE" },
    ),
};

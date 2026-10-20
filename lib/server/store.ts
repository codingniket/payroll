import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerJob, StoredEmployee } from "./model";

const dataDirectory = process.env.PAYROLL_DATA_DIRECTORY || path.join(process.cwd(), "data");
const jobPath = path.join(dataDirectory, "data.json");
const employeesPath = path.join(dataDirectory, "employee.json");
let writes = Promise.resolve();
// Route handlers can be bundled separately; share their lock in this Node process.
const runtime = globalThis as typeof globalThis & { payrollStoreOperations?: Promise<void> };
runtime.payrollStoreOperations ??= Promise.resolve();

// Serialize whole read/modify/write operations, not just their final file writes.
// This deliberately targets one Node process and one persistent data directory.
export function withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = runtime.payrollStoreOperations!.then(operation);
  runtime.payrollStoreOperations = result.then(() => undefined, () => undefined);
  return result;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const content = (await readFile(file, "utf8")).trim();
    return content ? JSON.parse(content) as T : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(file: string, value: string) {
  const operation = writes.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, value, "utf8");
    await rename(temporary, file);
  });
  writes = operation.catch(() => undefined);
  return operation;
}

export const store = {
  loadJob: () => readJson<ServerJob>(jobPath),
  saveJob: (job: ServerJob) => atomicWrite(jobPath, JSON.stringify(job, null, 2)),
  clearJob: () => atomicWrite(jobPath, ""),
  async loadEmployees() {
    const payload = await readJson<{ employees: StoredEmployee[] } | StoredEmployee[]>(employeesPath);
    return Array.isArray(payload) ? payload : payload?.employees ?? [];
  },
  saveEmployees: (employees: StoredEmployee[]) => atomicWrite(employeesPath, JSON.stringify({ employees }, null, 2)),
};

import type { PayrollVersion, SalaryCalculationMethod } from "@/types/payroll";
import { exportBase, exportOvertime } from "@/lib/server/export";
import {
  HttpError, calculateBase, calculateOvertime, compareMethods, currentJob, defaultShift, checkVersion, exitJob,
  startManualBase, updateAttendance, updateBase, updateManualBase, updateOvertime, uploadJob,
} from "@/lib/server/service";

type Context = { params: Promise<{ segments: string[] }> };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
async function readBody(request: Request): Promise<Record<string, unknown> & Partial<PayrollVersion>> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Send a valid JSON object.");
  return body as Record<string, unknown> & Partial<PayrollVersion>;
}
const errorResponse = (error: unknown) => {
  const known = error instanceof HttpError ? error : new HttpError("Payroll could not be completed.", 500);
  return json({ message: known.message, ...(known.issues ? { issues: known.issues } : {}) }, known.status);
};
const route = async (context: Context) => (await context.params).segments.join("/");

export async function GET(request: Request, context: Context) {
  try {
    const pathname = await route(context);
    if (pathname === "current") return json(await currentJob());
    if (pathname === "current/base/comparison") return json(await compareMethods());
    if (pathname === "current/export/base" || pathname === "current/export/overtime") {
      const job = await currentJob();
      const params = new URL(request.url).searchParams;
      checkVersion(job, { jobId: params.get("jobId") ?? "", revision: Number(params.get("revision") ?? -1) });
      const isBase = pathname.endsWith("base");
      const results = isBase ? job.basePayroll : job.overtimePayroll;
      if (!results.length) throw new HttpError(isBase ? "Calculate base payroll before downloading it." : "Calculate overtime payroll before downloading it.", 409);
      const output = isBase ? exportBase(job.basePayroll) : exportOvertime(job.overtimePayroll);
      return new Response(new Uint8Array(output), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${isBase ? "base" : "overtime"}-payroll-${job.month}.xlsx"`,
      } });
    }
    throw new HttpError("Payroll endpoint was not found.", 404);
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const pathname = await route(context);
    if (pathname === "upload") {
      const form = await request.formData();
      return json(await uploadJob(form.get("file") as File | null, String(form.get("payrollMonth") ?? ""), String(form.get("manualHolidayDates") ?? "[]")), 201);
    }
    if (pathname === "current/base/calculate") {
      const body = await readBody(request);
      return json(await calculateBase((body.salaryCalculationMethod ?? "total_days") as SalaryCalculationMethod, body));
    }
    if (pathname === "current/overtime/calculate") return json(await calculateOvertime(await readBody(request)));
    if (pathname === "current/exit") { await exitJob(await readBody(request)); return new Response(null, { status: 204 }); }
    throw new HttpError("Payroll endpoint was not found.", 404);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const pathname = await route(context);
    const body = await readBody(request);
    if (pathname === "current/attendance") return json(await updateAttendance(body, body));
    if (pathname === "current/attendance/default-shift") return json(await defaultShift(String(body.employeeCode ?? ""), body));
    if (pathname === "current/base/manual") return json(await startManualBase(String(body.employeeCode ?? ""), body));
    if (pathname.startsWith("current/base/manual/")) return json(await updateManualBase(pathname.slice("current/base/manual/".length), body.changes, body));
    if (pathname.startsWith("current/base/")) return json(await updateBase(pathname.slice("current/base/".length), body.changes, body));
    if (pathname.startsWith("current/overtime/")) return json(await updateOvertime(pathname.slice("current/overtime/".length), body.changes, body));
    throw new HttpError("Payroll endpoint was not found.", 404);
  } catch (error) { return errorResponse(error); }
}

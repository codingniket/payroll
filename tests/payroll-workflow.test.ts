import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "@e965/xlsx";
import type { ServerEmployee, ServerJob } from "@/lib/server/model";
import { applyPayrollChanges } from "@/lib/server/payroll-rules";
import { rebuildPayroll } from "@/lib/server/payroll-results";
import { reconcileEmployees } from "@/lib/server/employees";
import { applyPayrollMonth, parseRegisterRows } from "@/lib/server/parser";
import { exportBase, exportOvertime } from "@/lib/server/export";
import { PayrollSaveQueue } from "@/lib/payroll-save-queue";

function fixture(): ServerJob {
  const employee: ServerEmployee = {
    employeeCode: "A", employeeName: "Test Employee", attendanceSource: "uploaded",
    matched: true, salary: 30_000, shiftHours: 8, advance: 0, daysInMonth: 30,
    baseOverrides: {}, overtimeOverrides: {},
    days: Array.from({ length: 30 }, (_, i) => {
      const holiday = [7, 14, 21, 28].includes(i + 1), present = i < 4;
      return {
        date: `2026-06-${String(i + 1).padStart(2, "0")}`, day: i + 1,
        weekday: holiday ? "Sun" : "Mon", status: present ? "present" : holiday ? "holiday" : "absent",
        inTime: present ? "08:00" : null, outTime: present ? "17:00" : null,
        workedMinutes: present ? 540 : 0, sourceStatus: present ? "P" : holiday ? "WO" : "A",
        suspiciousConfirmed: false, hoursOverridden: false, issues: [],
      };
    }),
  };
  const job: ServerJob = {
    jobId: "test-job", revision: 1, month: "2026-06", sourceFileName: "fixture.xlsx",
    manualHolidayDates: [], salaryCalculationMethod: "total_days", employees: [employee],
    basePayroll: [], overtimePayroll: [], unresolvedAttendanceIssues: [],
  };
  rebuildPayroll(job, true); return job;
}
const master = [
  { employee_code: "A", name: "Test Employee", salary: 30_000, shift_hours: 8 as const },
  { employee_code: "B", name: "Not In Upload", salary: 40_000, shift_hours: 12 as const },
];
function sheetRows(buffer: Buffer) {
  const book = XLSX.read(buffer, { type: "buffer" });
  return XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: null });
}

// Small selectable-text attendance PDF. This exercises the real PDF.js import path.
function attendancePdf() {
  const items: Array<[number, number, string]> = [[20, 780, "Attendance June-2026"], [20, 750, "Emp Code : A"], [200, 750, "Emp Name : Test Employee"]];
  for (let day = 1; day <= 30; day++) {
    const x = 30 + day * 25;
    items.push([x, 720, String(day)], [x, 700, "Mo"]);
    ["Gene", "08:00", "16:00", "0", "0", "0:00", "8:00", "P"].forEach((value, index) => items.push([x, 680 - index * 20, value]));
  }
  const stream = items.map(([x, y, text]) => `BT /F1 7 Tf ${x} ${y} Td (${text}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 820] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new File([Buffer.from(pdf)], "attendance.pdf");
}

test("Present 4→7 adjusts absence, payout, and both workbooks", () => {
  const job = fixture();
  assert.equal(job.basePayroll[0].netAmount, 8000);
  applyPayrollChanges(job.employees[0], job, "base", { totalPresent: 7 });
  rebuildPayroll(job, true);
  assert.equal(job.basePayroll[0].totalAbsent, 19);
  assert.equal(job.basePayroll[0].netAmount, 11000);
  assert.equal(job.overtimePayroll[0].totalPresent, 7);
  assert.equal(sheetRows(exportBase(job.basePayroll))[1][15], 11000);
  assert.equal(sheetRows(exportOvertime(job.overtimePayroll))[1][6], 7);
});

test("upstream changes clear dependent totals but retain unrelated overrides", () => {
  const job = fixture(), employee = job.employees[0];
  applyPayrollChanges(employee, job, "base", { netAmount: 123, advance: 100, actualHoursWorkedMinutes: 3000 });
  applyPayrollChanges(employee, job, "overtime", { overtimeTotal: 2, tiffin: 55, netAmountOt: 3 });
  applyPayrollChanges(employee, job, "overtime", { newSalary: 60_000 });
  rebuildPayroll(job, true);
  assert.equal(job.basePayroll[0].salary, 60_000);
  assert.equal(job.basePayroll[0].netAmount, 15900);
  assert.equal(employee.baseOverrides.advance, 100);
  assert.equal(employee.baseOverrides.actualHoursWorkedMinutes, 3000);
  assert.equal(employee.overtimeOverrides.tiffin, 55);
  assert.equal(employee.overtimeOverrides.overtimeTotal, undefined);
  assert.notEqual(job.overtimePayroll[0].netAmountOt, 3);
});

test("holidays require reconciled counts and alter the working-day divisor", () => {
  const job = fixture(); job.salaryCalculationMethod = "working_days";
  assert.throws(() => applyPayrollChanges(job.employees[0], job, "base", { holiday: 6 }), /Adjust Present/);
  assert.throws(() => applyPayrollChanges(job.employees[0], job, "base", { holiday: 6, totalPresent: 4, totalAbsent: 22 }), /must equal/);
  applyPayrollChanges(job.employees[0], job, "overtime", { holiday: 6, totalPresent: 4, totalAbsent: 20 });
  rebuildPayroll(job, true);
  assert.equal(job.basePayroll[0].salaryDivisor, 24);
  assert.equal(job.basePayroll[0].netAmount, 5000);
  assert.equal(job.overtimePayroll[0].holiday, 6);
  applyPayrollChanges(job.employees[0], job, "base", { holiday: null });
  rebuildPayroll(job);
  assert.equal(job.basePayroll[0].holiday, 4);
  assert.equal(job.basePayroll[0].totalAbsent, 22);
  applyPayrollChanges(job.employees[0], job, "base", { totalPresent: 7 });
  applyPayrollChanges(job.employees[0], job, "base", { totalPresent: null });
  rebuildPayroll(job);
  assert.equal(job.basePayroll[0].totalPresent, 4);
  assert.equal(job.employees[0].baseOverrides.totalPresent, undefined);
});

test("missing master employees have identity-only rows, blank XLSX cells, and no payout", () => {
  const job = fixture();
  job.employees = reconcileEmployees(job.employees, master, job.month);
  rebuildPayroll(job, true);
  assert.equal(job.employees.length, 2);
  assert.equal(job.basePayroll[1].netAmount, null);
  assert.equal(job.overtimePayroll[1].netAmountOt, null);
  for (const rows of [sheetRows(exportBase(job.basePayroll)), sheetRows(exportOvertime(job.overtimePayroll))]) {
    assert.deepEqual(rows[2].slice(0, 2), ["B", "Not In Upload"]);
    assert.ok(rows[2].slice(2).every((cell) => cell === null || cell === ""));
  }
  assert.throws(() => applyPayrollChanges(job.employees[1], job, "base", { salary: 1 }), /Upload attendance/);
});

test("invalid payroll values and duplicate codes are rejected", () => {
  for (const changes of [{ salary: "bad" }, { shiftHours: 9 }, { totalPresent: 31 }, { totalAbsent: -1 }, { actualHoursWorkedMinutes: 1.5 }, { overtimeShiftDivisor: 0 }, { netAmountOt: Infinity }]) {
    const job = fixture();
    assert.throws(() => applyPayrollChanges(job.employees[0], job, "overtime", changes));
  }
  const job = fixture();
  assert.throws(() => reconcileEmployees([job.employees[0], structuredClone(job.employees[0])], master, job.month), /Duplicate employee/);
  applyPayrollChanges(job.employees[0], job, "base", { netAmount: -50 });
  rebuildPayroll(job); assert.equal(job.basePayroll[0].netAmount, -50);
});

test("every editable salary-composition column survives workbook export, including zero", () => {
  const fields: Array<["base" | "overtime", string, number, number]> = [
    ["base", "shiftHours", 10, 2], ["base", "salary", 42000, 3], ["base", "perDay", 0, 4],
    ["base", "totalAbsent", 20, 5], ["base", "holiday", 5, 6], ["base", "totalPresent", 7, 7],
    ["base", "absentDeduction", 500, 8], ["base", "totalHoursMinutes", 3200, 9], ["base", "actualHoursWorkedMinutes", 3000, 10],
    ["base", "advance", 0, 11], ["base", "lateTimeMinutes", 45, 12], ["base", "lateFine", 25, 13],
    ["base", "deduction", 700, 14], ["base", "netAmount", -50, 15],
    ["overtime", "shiftHours", 12, 2], ["overtime", "newSalary", 42000, 3],
    ["overtime", "totalAbsent", 20, 4], ["overtime", "holiday", 5, 5], ["overtime", "totalPresent", 7, 6],
    ["overtime", "totalHoursMinutes", 3200, 7], ["overtime", "perDay", 0, 8], ["overtime", "actualHoursWorkedMinutes", 3000, 9],
    ["overtime", "overtimeHoursMinutes", 330, 10], ["overtime", "overtimeShiftDivisor", 4, 11],
    ["overtime", "overtimeTotal", 0, 12], ["overtime", "tiffin", 125, 13], ["overtime", "netAmountOt", -50, 14],
  ];
  for (const [kind, field, value, column] of fields) {
    const job = fixture();
    const changes = field === "holiday" ? { holiday: value, totalPresent: 4, totalAbsent: 21 } : { [field]: value };
    applyPayrollChanges(job.employees[0], job, kind, changes); rebuildPayroll(job, true);
    const rows = sheetRows(kind === "base" ? exportBase(job.basePayroll) : exportOvertime(job.overtimePayroll));
    const expected = field.endsWith("Minutes") ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}` : value;
    assert.equal(rows[1][column], expected, `${kind}.${field}`);
  }
});

test("missing dates are added for review; leap-month dates are preserved", () => {
  const job = fixture();
  job.employees[0].days = job.employees[0].days.slice(0, 20);
  applyPayrollMonth(job, "2028-02");
  assert.equal(job.employees[0].days.length, 29);
  assert.equal(job.employees[0].days[28].status, "missing");
  assert.equal(job.employees[0].days[28].date, "2028-02-29");
});

test("the save barrier awaits sequential edits and remembers failures until corrected", async () => {
  const queue = new PayrollSaveQueue(); queue.reset(fixture());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.enqueue("salary", async (job) => { await gate; return { ...job, revision: job.revision + 1 }; });
  const second = queue.enqueue("advance", async (job) => { assert.equal(job.revision, 2); return { ...job, revision: 3 }; });
  let exported = false;
  const barrier = queue.flush().then((job) => { exported = true; return job; });
  await Promise.resolve(); assert.equal(exported, false);
  release(); await Promise.all([first, second]);
  assert.equal((await barrier).revision, 3);
  await assert.rejects(queue.enqueue("salary", async () => { throw new Error("Save failed"); }), /Save failed/);
  await queue.enqueue("advance", async (job) => job);
  await assert.rejects(queue.flush(), /Save failed/);
  await queue.enqueue("salary", async (job) => job);
  assert.equal((await queue.flush()).revision, 3);
});

let temporaryDirectory: string | undefined;
after(async () => {
  // Only remove the uniquely-created test directory, never an application data path.
  if (temporaryDirectory && path.basename(temporaryDirectory).startsWith("payroll-test-") && path.dirname(temporaryDirectory) === path.resolve(tmpdir())) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("service saves, exports, imports and revision conflicts use isolated storage", async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "payroll-test-"));
  process.env.PAYROLL_DATA_DIRECTORY = temporaryDirectory;
  const { store } = await import("@/lib/server/store");
  const service = await import("@/lib/server/service");
  await store.saveEmployees(master);
  await store.saveJob(fixture());
  const before = await readFile(path.join(temporaryDirectory, "data.json"), "utf8");
  let job = await service.currentJob();
  assert.equal(job.employees.length, 2);
  assert.equal(await readFile(path.join(temporaryDirectory, "data.json"), "utf8"), before, "GET must not write");

  const results = await Promise.allSettled([
    service.updateBase("A", { advance: 100 }, job),
    service.updateBase("A", { salary: 60_000 }, job),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.equal(failure.reason.status, 409);
  job = await service.currentJob();
  job = await service.updateOvertime("A", { newSalary: 60_000 }, job);
  assert.equal(job.basePayroll[0].advance, 100);
  assert.equal(job.overtimePayroll[0].newSalary, 60_000);
  const snapshot = await readFile(path.join(temporaryDirectory, "data.json"), "utf8");
  await assert.rejects(service.updateBase("A", { salary: "invalid" }, job), /valid number/);
  assert.equal(await readFile(path.join(temporaryDirectory, "data.json"), "utf8"), snapshot);
  await assert.rejects(service.updateAttendance({ employeeCode: "A", date: "2026-06-01", workedMinutes: -1 }, job), /0–24/);

  const routes = await import("@/app/api/payroll/[...segments]/route");
  const exported = await routes.GET(new Request(`http://localhost/api/payroll/current/export/base?jobId=${job.jobId}&revision=${job.revision}`), { params: Promise.resolve({ segments: ["current", "export", "base"] }) });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("Cache-Control"), "private, no-store");
  assert.equal(sheetRows(Buffer.from(await exported.arrayBuffer()))[1][3], 60_000);
  const stale = await routes.GET(new Request("http://localhost/api/payroll/current/export/base?jobId=test-job&revision=1"), { params: Promise.resolve({ segments: ["current", "export", "base"] }) });
  assert.equal(stale.status, 409);

  const rows = [["Attendance June-2026"], ["Emp Code : A", null, "Emp Name : Test Employee"], [], [null, ...Array.from({ length: 30 }, (_, i) => i + 1)], [null, ...Array(30).fill("Mo")], [null, ...Array(30).fill("Gene\n08:00\n16:00\n0\n0\n0:00\n8:00\nP")]];
  assert.equal(parseRegisterRows(rows).employees.length, 1);
  for (const bookType of ["xlsx", "xls"] as const) {
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Attendance");
    const file = new File([new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType }))], `attendance.${bookType}`);
    const uploaded = await service.uploadJob(file, "2026-06", "[]");
    assert.equal(uploaded.employees.length, 2);
    assert.equal(uploaded.employees[1].attendanceSource, "not_uploaded");
    const calculated = await service.calculateBase("total_days", uploaded);
    assert.equal(calculated.basePayroll[1].salary, null);
  }
  const pdfJob = await service.uploadJob(attendancePdf(), "2026-06", "[]");
  assert.equal(pdfJob.employees.length, 2);
  assert.equal(pdfJob.employees[0].days.length, 30);
  assert.equal(pdfJob.employees[1].attendanceSource, "not_uploaded");
  const pdfPayroll = await service.calculateBase("total_days", pdfJob);
  assert.equal(pdfPayroll.basePayroll[1].netAmount, null);
  // Malformed persisted numeric data must not silently produce an invalid workbook.
  await writeFile(path.join(temporaryDirectory, "data.json"), JSON.stringify({ ...fixture(), employees: [{ ...fixture().employees[0], baseOverrides: { salary: "broken" } }] }));
  await assert.rejects(service.currentJob(), /invalid numeric/);
});

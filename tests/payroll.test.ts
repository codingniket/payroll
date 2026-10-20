import assert from "node:assert/strict";
import test from "node:test";
import type { ServerEmployee } from "@/lib/server/model";
import { calculateBasePayroll, calculateOvertimePayroll } from "@/lib/server/calculations";
import { parseRegisterRows } from "@/lib/server/parser";
import { workedMinutesFromPunches } from "@/lib/server/time";

function employeeFixture(shiftHours = 8, salary = 30_000): ServerEmployee {
  return {
    employeeCode: "4", employeeName: "Employee", salary, shiftHours, advance: 500, daysInMonth: 30,
    days: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, "0")}`, day: index + 1,
      weekday: [7, 14, 21, 28].includes(index + 1) ? "Su" : "Mo", status: "present",
      workedMinutes: shiftHours * 60, inTime: "08:00", outTime: "16:00", sourceStatus: "P",
      suspiciousConfirmed: false, hoursOverridden: false, issues: [],
    })), matched: true, baseOverrides: {}, overtimeOverrides: {},
  };
}

test("base payroll matches holiday, absence and late-fine rules", () => {
  const employee = employeeFixture();
  employee.days[0].workedMinutes = 360;
  employee.days[1].status = "absent"; employee.days[1].workedMinutes = 0;
  const result = calculateBasePayroll(employee, "2026-06", ["2026-06-10"]);
  assert.deepEqual([result.holiday, result.totalAbsent, result.totalPresent, result.lateTimeMinutes, result.absentDeduction, result.lateFine, result.netAmount], [5, 1, 24, 120, 1000, 250, 28250]);
});

test("working-day salary and overtime use the same rounded base rate", () => {
  const employee = employeeFixture(8, 13_000);
  employee.daysInMonth = 31;
  employee.days = Array.from({ length: 31 }, (_, index) => ({ ...employee.days[Math.min(index, 29)], date: `2026-07-${String(index + 1).padStart(2, "0")}`, day: index + 1, weekday: [5, 12, 19, 26].includes(index + 1) ? "Su" : "Mo", workedMinutes: index === 0 ? 540 : 480 }));
  const base = calculateBasePayroll(employee, "2026-07", [], "working_days");
  const overtime = calculateOvertimePayroll(employee, base);
  assert.equal(base.salaryDivisor, 27); assert.equal(base.perDay, 481);
  assert.equal(overtime.overtimeHoursMinutes, 60); assert.equal(overtime.overtimeTotal, 80);
});

test("register rows normalize statuses and selected month", () => {
  const dates = [null, ...Array.from({ length: 30 }, (_, index) => index + 1)];
  const weekdays = [null, ...Array.from({ length: 30 }, (_, index) => [7, 14, 21, 28].includes(index + 1) ? "Su" : "Mo")];
  const details = ["head", ...Array.from({ length: 30 }, (_, index) => index === 7 ? "Gene\n06:51\n\n0\n699\n0:00\n0:00\nMIS" : "Gene\n06:53\n14:53\n0\n0\n0:00\n8:00\nP")];
  const parsed = parseRegisterRows([["Attendance"], [], ["Emp Code : 4", null, null, "Emp Name : xxx"], [], dates, weekdays, details], "2026-07");
  assert.equal(parsed.month, "2026-07"); assert.equal(parsed.employees[0].days.length, 30);
  assert.equal(parsed.employees[0].days[7].status, "missing"); assert.equal(parsed.employees[0].days[7].outTime, null);
});

test("overnight punches roll into the next day", () => assert.equal(workedMinutesFromPunches("22:00", "06:00"), 480));

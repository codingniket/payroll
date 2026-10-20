import * as XLSX from "@e965/xlsx";
import type { AttendanceStatus } from "@/types/payroll";
import type { ServerDay, ServerEmployee } from "./model";
import { parseMinutes } from "./time";

export class RegisterParseError extends Error {}

type Row = unknown[];
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const text = (value: unknown) => value == null ? "" : String(value).trim();
const codePattern = /Emp\s*Code\s*:\s*(.+)/i;
const namePattern = /Emp\s*Name\s*:\s*(.+)/i;

function normalizeStatus(source: unknown): AttendanceStatus {
  const value = text(source).toUpperCase();
  const compact = value.replace(/[^A-Z0-9]/g, "");
  if (["WO", "WEEKLY OFF"].includes(value) || compact.includes("WO") || compact.includes("WIO") || compact.includes("W0I")) return "holiday";
  if (value === "A") return "absent";
  if (value === "MIS" || value.startsWith("MIS")) return "missing";
  if (value === "P" || value.startsWith("P/")) return "present";
  if (["HOLIDAY", "H"].includes(value)) return "holiday";
  return "unknown";
}

function findMonth(rows: Row[], selectedMonth?: string) {
  if (selectedMonth) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(selectedMonth)) throw new RegisterParseError("Choose a valid payroll month.");
    return selectedMonth.split("-").map(Number) as [number, number];
  }
  const pattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s*[- ]\s*(20\d{2})/i;
  for (const row of rows) for (const cell of row) {
    const match = text(cell).match(pattern);
    if (match) return [Number(match[2]), MONTHS.findIndex((month) => month.toLowerCase() === match[1].toLowerCase())] as [number, number];
  }
  throw new RegisterParseError("The payroll month could not be found in the register title.");
}

function parseDailyCell(value: unknown): Omit<ServerDay, "date" | "day" | "weekday"> {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length < 8) lines.push("");
  const [shiftLabel, inValue, outValue, late, early, sourceOt, worked, sourceStatus] = lines;
  return {
    shiftLabel: shiftLabel.trim(), inTime: inValue.trim() || null, outTime: outValue.trim() || null,
    lateMinutesFromSource: /^\d+$/.test(late.trim()) ? Number(late.trim()) : 0,
    earlyDepartureMinutesFromSource: /^\d+$/.test(early.trim()) ? Number(early.trim()) : 0,
    sourceOtMinutes: parseMinutes(sourceOt), workedMinutes: parseMinutes(worked), sourceStatus: sourceStatus.trim(),
    status: normalizeStatus(sourceStatus), suspiciousConfirmed: false, hoursOverridden: false, issues: [],
  } as Omit<ServerDay, "date" | "day" | "weekday">;
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

function dailyValue(rows: Row[], dateRowIndex: number, column: number) {
  const direct = text(rows[dateRowIndex + 2]?.[column]);
  if (direct.includes("\n")) return direct;
  return Array.from({ length: 8 }, (_, index) => text(rows[dateRowIndex + 2 + index]?.[column])).join("\n");
}

export function parseRegisterRows(rows: Row[], selectedMonth?: string) {
  if (!rows.length) throw new RegisterParseError("The attendance file is empty.");
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill(null)]);
  const [year, month] = findMonth(normalized, selectedMonth);
  const anchors = normalized.map((row, index) => row.some((cell) => codePattern.test(text(cell))) ? index : -1).filter((index) => index >= 0);
  if (!anchors.length) throw new RegisterParseError("No employee register was found in the attendance file.");
  const employees: ServerEmployee[] = [];
  for (let anchor = 0; anchor < anchors.length; anchor++) {
    const headerIndex = anchors[anchor];
    const blockEnd = anchors[anchor + 1] ?? normalized.length;
    const header = normalized[headerIndex];
    const employeeCode = header.map(text).map((cell) => cell.match(codePattern)?.[1]?.trim()).find(Boolean);
    const employeeName = header.map(text).map((cell) => cell.match(namePattern)?.[1]?.trim()).find(Boolean);
    if (!employeeCode || !employeeName) throw new RegisterParseError("An employee block is missing its code or name.");
    let dateRowIndex = -1;
    let dateColumns: Array<[number, number]> = [];
    for (let index = headerIndex + 1; index < Math.min(blockEnd, headerIndex + 12); index++) {
      const columns = normalized[index].map((cell, column) => [column, Number(text(cell))] as [number, number]).filter(([, day]) => Number.isInteger(day) && day >= 1 && day <= 31);
      if (columns.length >= 20) { dateRowIndex = index; dateColumns = columns; break; }
    }
    if (dateRowIndex < 0) throw new RegisterParseError(`Daily attendance columns were not found for employee ${employeeCode}.`);
    const monthDays = daysInMonth(year, month);
    const days = dateColumns.filter(([, day]) => day <= monthDays).map(([column, day]) => ({
      ...parseDailyCell(dailyValue(normalized, dateRowIndex, column)),
      date: isoDate(year, month, day), day, weekday: text(normalized[dateRowIndex + 1]?.[column]),
    })) as ServerDay[];
    employees.push({ employeeCode, employeeName, sourceSummary: header.map(text).filter(Boolean).join(" | "), days,
      daysInMonth: monthDays, matched: false, salary: 0, shiftHours: 0, advance: 0, baseOverrides: {}, overtimeOverrides: {} });
  }
  return { month: `${year}-${String(month).padStart(2, "0")}`, employees };
}

async function pdfRows(buffer: Buffer): Promise<Row[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, useSystemFonts: true }).promise;
  const allItems: Array<{ x: number; y: number; value: string; page: number }> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] };
      if (item.str && item.transform) allItems.push({ x: item.transform[4], y: item.transform[5], value: item.str, page: pageNumber });
    }
  }
  if (!allItems.length) throw new RegisterParseError("The PDF has no selectable attendance table. Upload the Excel file or a text-based PDF.");
  const xAnchors: number[] = [];
  for (const item of allItems.sort((a, b) => a.x - b.x)) if (!xAnchors.some((x) => Math.abs(x - item.x) < 2)) xAnchors.push(item.x);
  const rows: Row[] = [];
  for (let page = 1; page <= document.numPages; page++) {
    const pageItems = allItems.filter((item) => item.page === page);
    const yAnchors: number[] = [];
    for (const item of pageItems.sort((a, b) => b.y - a.y)) if (!yAnchors.some((y) => Math.abs(y - item.y) < 2)) yAnchors.push(item.y);
    for (const y of yAnchors) {
      const row = Array(xAnchors.length).fill(null) as unknown[];
      for (const item of pageItems.filter((candidate) => Math.abs(candidate.y - y) < 2).sort((a, b) => a.x - b.x)) {
        const column = xAnchors.reduce((best, x, index) => Math.abs(x - item.x) < Math.abs(xAnchors[best] - item.x) ? index : best, 0);
        row[column] = [row[column], item.value].filter(Boolean).join(" ");
      }
      rows.push(row);
    }
  }
  return rows;
}

export async function parseAttendanceFile(buffer: Buffer, extension: string, selectedMonth?: string) {
  if ([".xls", ".xlsx"].includes(extension)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return parseRegisterRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: true }) as Row[], selectedMonth);
  }
  if (extension === ".pdf") return parseRegisterRows(await pdfRows(buffer), selectedMonth);
  throw new RegisterParseError("Upload an XLS, XLSX, or PDF attendance file.");
}

export function applyPayrollMonth(attendance: { month: string; employees: ServerEmployee[] }, payrollMonth: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(payrollMonth)) throw new Error("Choose a valid payroll month.");
  const [year, month] = payrollMonth.split("-").map(Number);
  const monthDays = daysInMonth(year, month);
  attendance.month = payrollMonth;
  for (const employee of attendance.employees) {
    if (new Set(employee.days.map((day) => day.day)).size !== employee.days.length) throw new RegisterParseError(`Duplicate attendance dates for employee ${employee.employeeCode}.`);
    employee.days = employee.days.filter((day) => day.day <= monthDays).map((day) => {
      const date = new Date(Date.UTC(year, month - 1, day.day));
      return { ...day, date: isoDate(year, month, day.day), weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) };
    });
    const found = new Set(employee.days.map((day) => day.day));
    for (let day = 1; day <= monthDays; day++) {
      if (found.has(day)) continue;
      employee.days.push({
        date: isoDate(year, month, day), day,
        weekday: new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        inTime: null, outTime: null, workedMinutes: null, status: "missing", sourceStatus: "",
        suspiciousConfirmed: false, hoursOverridden: false, issues: [],
      });
    }
    employee.days.sort((a, b) => a.day - b.day);
    employee.daysInMonth = monthDays;
  }
}

export function validateHolidayDates(values: unknown[], payrollMonth: string) {
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !value.startsWith(`${payrollMonth}-`)) throw new Error("Company holidays must be within the selected payroll month.");
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose valid company holiday dates.");
    normalized.add(value);
  }
  return [...normalized].sort();
}

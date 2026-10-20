export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function parseDuration(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function calculateWorkedMinutes(inTime: string, outTime: string): number | null {
  const inMinutes = parseClockMinutes(inTime);
  let outMinutes = parseClockMinutes(outTime);
  if (inMinutes === null || outMinutes === null) return null;
  if (outMinutes < inMinutes) outMinutes += 24 * 60;
  return outMinutes - inMinutes;
}

export function calculateOutTime(inTime: string, workedMinutes: number): string | null {
  const inMinutes = parseClockMinutes(inTime);
  if (inMinutes === null || workedMinutes < 0 || !Number.isInteger(workedMinutes)) return null;
  const outMinutes = (inMinutes + workedMinutes) % (24 * 60);
  return `${String(Math.floor(outMinutes / 60)).padStart(2, "0")}:${String(outMinutes % 60).padStart(2, "0")}`;
}

function parseClockMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatMonth(month: string | undefined): string {
  if (!month) return "Current payroll";
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

export function formatRupees(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

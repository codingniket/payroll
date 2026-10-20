export function parseMinutes(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseClockMinutes(value: unknown): number | null {
  const minutes = parseMinutes(value);
  return minutes === null || minutes >= 1440 ? null : minutes;
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function workedMinutesFromPunches(inTime: string | null, outTime: string | null) {
  const start = parseClockMinutes(inTime);
  let end = parseClockMinutes(outTime);
  if (start === null || end === null) return null;
  if (end < start) end += 1440;
  return end - start;
}

export function outTimeFromWorkedMinutes(inTime: string | null, workedMinutes: number) {
  const start = parseClockMinutes(inTime);
  if (start === null || workedMinutes < 0) return null;
  const end = (start + workedMinutes) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function inTimeFromWorkedMinutes(outTime: string | null, workedMinutes: number) {
  const end = parseClockMinutes(outTime);
  if (end === null || workedMinutes < 0) return null;
  const start = (end - workedMinutes + 1440) % 1440;
  return `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
}

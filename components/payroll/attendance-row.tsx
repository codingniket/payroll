"use client";

import { useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateOutTime, calculateWorkedMinutes, formatMinutes, parseDuration } from "@/lib/time";
import type { AttendanceDay } from "@/types/payroll";

export function AttendanceRow({ day, onSave, rowId, disabled }: { day: AttendanceDay; onSave: (changes: Record<string, unknown>) => Promise<void>; rowId?: string; disabled?: boolean }) {
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState("");
  const inTimeRef = useRef<HTMLInputElement>(null);
  const outTimeRef = useRef<HTMLInputElement>(null);
  const workedMinutesRef = useRef<HTMLInputElement>(null);

  const save = (changes: Record<string, unknown>) => {
    setPendingSaves((count) => count + 1);
    // Enqueue immediately in the page-wide coordinator so Continue can await it.
    void onSave(changes)
      .then(() => setError(""))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save attendance."))
      .finally(() => setPendingSaves((count) => Math.max(0, count - 1)));
  };

  const savePunches = () => {
    const inTime = inTimeRef.current?.value ?? "";
    const outTime = outTimeRef.current?.value ?? "";
    const calculatedMinutes = calculateWorkedMinutes(inTime, outTime);
    if (calculatedMinutes !== null && workedMinutesRef.current) {
      workedMinutesRef.current.value = formatMinutes(calculatedMinutes);
    }
    save({ inTime: inTime || null, outTime: outTime || null });
  };

  const issue = day.issues[0];
  return (
    <tr id={rowId} tabIndex={issue ? -1 : undefined} className={issue ? "issueRow" : undefined}>
      <td className="dateCell"><strong>{day.day}</strong><span>{day.weekday}</span></td>
      <td><input disabled={disabled} key={`in-${day.inTime}`} ref={inTimeRef} className="tableInput timeValue" type="time" defaultValue={day.inTime ?? ""} onBlur={savePunches} /></td>
      <td><input disabled={disabled} key={`out-${day.outTime}`} ref={outTimeRef} className="tableInput timeValue" type="time" defaultValue={day.outTime ?? ""} onBlur={savePunches} /></td>
      <td><input disabled={disabled} key={`worked-${day.workedMinutes}`} ref={workedMinutesRef} className="tableInput timeValue" defaultValue={formatMinutes(day.workedMinutes)} placeholder="H:MM" aria-label={`Hours worked on ${day.date}`} onBlur={(event) => {
        const parsed = parseDuration(event.target.value);
        if (parsed === null) { save({ workedMinutes: null }); return; }
        const inTime = inTimeRef.current?.value ?? "";
        const calculatedOutTime = calculateOutTime(inTime, parsed);
        if (calculatedOutTime && outTimeRef.current) {
          outTimeRef.current.value = calculatedOutTime;
          save({ inTime, outTime: calculatedOutTime, workedMinutes: parsed });
          return;
        }
        save({ workedMinutes: parsed });
      }} /></td>
      <td>
        <select disabled={disabled} className="tableInput" value={day.status} onChange={(event) => save({ status: event.target.value })}>
          <option value="present">Present</option><option value="absent">Absent</option><option value="holiday">Holiday</option>
          {!["present", "absent", "holiday"].includes(day.status) ? <option value={day.status}>Needs review</option> : null}
        </select>
      </td>
      <td className="issueCell">
        {issue ? <><TriangleAlert size={15} /><span>{issue.message}</span>{issue.code === "suspicious_time" ? <Button size="small" variant="quiet" onClick={() => save({ suspiciousConfirmed: true })}><Check size={14} /> Confirm</Button> : null}</> : <span className="resolvedMark">Ready</span>}
        {pendingSaves > 0 ? <span className="savingDot" aria-label="Saving" /> : null}
        {error ? <span className="formError" role="alert">{error}</span> : null}
      </td>
    </tr>
  );
}

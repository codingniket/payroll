import type { ServerEmployee } from "./model";
import { inTimeFromWorkedMinutes, outTimeFromWorkedMinutes } from "./time";

export function applyDefaultShift(employee: ServerEmployee) {
  const shiftMinutes = employee.shiftHours * 60;
  for (const day of employee.days) {
    if (!day.inTime && !day.outTime) continue;
    day.status = "present";
    day.workedMinutes = shiftMinutes;
    day.hoursOverridden = true;
    day.defaultShiftApplied = true;
    if (day.inTime) day.outTime = outTimeFromWorkedMinutes(day.inTime, shiftMinutes);
    else if (day.outTime) day.inTime = inTimeFromWorkedMinutes(day.outTime, shiftMinutes);
  }
}

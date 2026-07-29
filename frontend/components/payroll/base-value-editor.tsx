"use client";

import { RotateCcw } from "lucide-react";
import { formatMinutes, parseDuration } from "@/lib/time";

export function BaseValueEditor({ value, field, duration = false, overridden, onChange, onReset }: {
  value: number; field: string; duration?: boolean; overridden: boolean;
  onChange: (field: string, value: number) => void; onReset: (field: string) => void;
}) {
  return (
    <div className={overridden ? "valueEditor overridden" : "valueEditor"}>
      <input
        className={duration ? "timeValue" : undefined}
        aria-label={field}
        defaultValue={duration ? formatMinutes(value) : value}
        onBlur={(event) => {
          const parsed = duration ? parseDuration(event.target.value) : Number(event.target.value);
          if (parsed !== null && Number.isFinite(parsed)) onChange(field, parsed);
        }}
      />
      {overridden ? <button type="button" title="Reset calculated value" onClick={() => onReset(field)}><RotateCcw size={12} /></button> : null}
    </div>
  );
}


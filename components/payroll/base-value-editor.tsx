"use client";

import { RotateCcw } from "lucide-react";
export function BaseValueEditor({ value, field, duration = false, overridden, disabled, invalid, onChange, onCommit, onReset }: {
  value: string; field: string; duration?: boolean; overridden: boolean; disabled?: boolean; invalid?: boolean;
  onChange: (value: string) => void; onCommit: () => void; onReset: () => void;
}) {
  return (
    <div className={overridden ? "valueEditor overridden" : "valueEditor"}>
      <input
        className={duration ? "timeValue" : undefined}
        aria-label={field}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
      />
      {overridden ? <button type="button" disabled={disabled} title="Reset calculated value" onMouseDown={(event) => event.preventDefault()} onClick={onReset}><RotateCcw size={12} /></button> : null}
    </div>
  );
}

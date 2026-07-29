import { Check } from "lucide-react";
import { formatMonth } from "@/lib/time";

const steps = [
  { key: "upload", label: "Upload" },
  { key: "hours", label: "Review hours" },
  { key: "base", label: "Base payroll" },
  { key: "overtime", label: "Overtime" },
] as const;

export type PayrollStage = (typeof steps)[number]["key"];

export function LedgerProgress({ month, current }: { month?: string; current: PayrollStage }) {
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <div className="ledger" aria-label="Payroll progress">
      <div className="ledgerMonth">{formatMonth(month)}</div>
      <ol className="ledgerSteps">
        {steps.map((step, index) => (
          <li key={step.key} className={index <= currentIndex ? "ledgerStep active" : "ledgerStep"} aria-current={step.key === current ? "step" : undefined}>
            <span className="ledgerMark">{index < currentIndex ? <Check size={12} strokeWidth={2.5} /> : index + 1}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}


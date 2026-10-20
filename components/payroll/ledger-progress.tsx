import { Clock3, FileUp, IndianRupee, Timer } from "lucide-react";
import { formatMonth } from "@/lib/time";

const steps = [
  { key: "upload", label: "Upload", icon: FileUp },
  { key: "hours", label: "Review hours", icon: Clock3 },
  { key: "base", label: "Base payroll", icon: IndianRupee },
  { key: "overtime", label: "Overtime", icon: Timer },
] as const;

export type PayrollStage = (typeof steps)[number]["key"];

export function LedgerProgress({ month, current }: { month?: string; current: PayrollStage }) {
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <div className="ledger" aria-label="Payroll progress">
      <div className="ledgerMonth">{formatMonth(month)}</div>
      <ol className="ledgerSteps">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          return (
            <li key={step.key} className={index <= currentIndex ? "ledgerStep active" : "ledgerStep"} aria-current={step.key === current ? "step" : undefined}>
              <span className="ledgerMark"><StepIcon size={13} strokeWidth={2.2} /></span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

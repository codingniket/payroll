import type { LucideIcon } from "lucide-react";
import { UsersRound } from "lucide-react";
import { formatRupees } from "@/lib/time";

export function PayrollSummary({
  employeeCount,
  totalLabel,
  totalAmount,
  totalIcon: TotalIcon,
}: {
  employeeCount: number;
  totalLabel: string;
  totalAmount: number;
  totalIcon: LucideIcon;
}) {
  return (
    <section className="payrollSummary" aria-label="Private payroll totals">
      <div className="summaryMetric">
        <span className="summaryIcon"><UsersRound size={17} /></span>
        <span><small>Total employees</small><strong>{employeeCount}</strong></span>
      </div>
      <div className="summaryDivider" />
      <div className="summaryMetric">
        <span className="summaryIcon"><TotalIcon size={17} /></span>
        <span><small>{totalLabel}</small><strong className="summaryMoney">{formatRupees(totalAmount)}</strong></span>
      </div>
      <span className="privateLabel">Private view</span>
    </section>
  );
}

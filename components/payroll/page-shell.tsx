import type { ReactNode } from "react";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { LedgerProgress, type PayrollStage } from "./ledger-progress";

export function PageShell({
  stage,
  month,
  title,
  description,
  actions,
  employeesActive = false,
  onNavigate,
  children,
}: {
  stage?: PayrollStage;
  month?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  employeesActive?: boolean;
  onNavigate?: (href: string) => void;
  children: ReactNode;
}) {
  return (
    <main className="appShell">
      <header className="topbar">
        <Link href="/" className="wordmark" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("/"); } : undefined}>Payday Ledger</Link>
        <nav className="topbarNav" aria-label="Primary navigation">
          <Link href="/employees" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("/employees"); } : undefined} className={employeesActive ? "topbarLink active" : "topbarLink"} aria-current={employeesActive ? "page" : undefined}><UsersRound size={16} /> Employees</Link>
        </nav>
      </header>
      {stage ? <LedgerProgress current={stage} month={month} /> : null}
      <section className="pageHeading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="pageActions">{actions}</div> : null}
      </section>
      {children}
    </main>
  );
}

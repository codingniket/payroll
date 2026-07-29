import type { ReactNode } from "react";
import Link from "next/link";
import { LedgerProgress, type PayrollStage } from "./ledger-progress";

export function PageShell({
  stage,
  month,
  title,
  description,
  actions,
  children,
}: {
  stage: PayrollStage;
  month?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="appShell">
      <header className="topbar">
        <Link href="/" className="wordmark">Payday Ledger</Link>
      </header>
      <LedgerProgress current={stage} month={month} />
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


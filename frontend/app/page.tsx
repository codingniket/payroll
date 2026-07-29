import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landingRegister" aria-hidden="true">
        <span>IN</span><span>OUT</span><span>HOURS</span><span>STATUS</span>
      </div>
      <div className="landingCopy">
        <p className="eyebrow">Monthly payroll</p>
        <h1>Attendance in.<br />Payroll ready.</h1>
        <p>Review working hours, calculate pay, and download both payroll reports.</p>
        <Link href="/upload" className="button buttonPrimary buttonDefault">
          Let&apos;s make payroll <ArrowRight size={18} />
        </Link>
      </div>
      <p className="landingNote">XLS · XLSX · PDF</p>
    </main>
  );
}


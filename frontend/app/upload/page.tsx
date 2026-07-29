"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, FileSpreadsheet, Plus, X } from "lucide-react";
import { PageShell } from "@/components/payroll/page-shell";
import { Button } from "@/components/ui/button";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addHoliday() {
    if (holidayDate && !holidays.includes(holidayDate)) {
      setHolidays((current) => [...current, holidayDate].sort());
      setHolidayDate("");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Choose an attendance file.");
    setSubmitting(true);
    setError("");
    try {
      await payrollApi.upload(file, holidays);
      router.push("/hours");
    } catch (caught) {
      setError(caught instanceof PayrollApiError ? caught.message : "The file could not be uploaded.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell stage="upload" title="Upload attendance" description="Add the monthly register and any company holidays.">
      <form className="uploadPanel" onSubmit={submit}>
        <label className="fileDrop">
          <FileSpreadsheet size={24} />
          <span>{file ? file.name : "Choose attendance file"}</span>
          <small>XLS, XLSX, or matching PDF</small>
          <input type="file" accept=".xls,.xlsx,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>

        <div className="holidaySection">
          <div className="sectionLabel"><CalendarPlus size={17} /> Company holidays</div>
          <div className="holidayInput">
            <input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} aria-label="Company holiday date" />
            <Button type="button" variant="secondary" onClick={addHoliday} disabled={!holidayDate}><Plus size={16} /> Add date</Button>
          </div>
          {holidays.length ? (
            <div className="dateChips">
              {holidays.map((date) => (
                <button type="button" key={date} onClick={() => setHolidays((values) => values.filter((value) => value !== date))}>
                  {date} <X size={13} />
                </button>
              ))}
            </div>
          ) : <p className="helperText">Sundays are included automatically.</p>}
        </div>

        {error ? <p className="formError" role="alert">{error}</p> : null}
        <div className="formFooter"><Button type="submit" disabled={submitting}>{submitting ? "Reading attendance…" : "Continue"}</Button></div>
      </form>
    </PageShell>
  );
}


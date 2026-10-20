"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Search, Trash2, UserPlus, X } from "lucide-react";
import { PageShell } from "@/components/payroll/page-shell";
import { StateMessage } from "@/components/payroll/state-message";
import { Button } from "@/components/ui/button";
import { employeesApi, PayrollApiError } from "@/lib/payroll-api";
import { formatRupees } from "@/lib/time";
import type { EmployeeMasterRecord, EmployeeMasterResponse } from "@/types/payroll";

type EmployeeDraft = {
  employeeCode: string;
  name: string;
  salary: string;
  shiftHours: "8" | "10" | "12";
};

const emptyDraft: EmployeeDraft = {
  employeeCode: "",
  name: "",
  salary: "",
  shiftHours: "8",
};

function draftFromEmployee(employee: EmployeeMasterRecord): EmployeeDraft {
  return {
    employeeCode: employee.employeeCode,
    name: employee.name,
    salary: String(employee.salary),
    shiftHours: String(employee.shiftHours) as EmployeeDraft["shiftHours"],
  };
}

function statusMessage(response: EmployeeMasterResponse): string {
  if (response.payrollStatus === "recalculated") return "Employee saved. Current payroll recalculated.";
  if (response.payrollStatus === "invalidated") return "Employee saved. Review attendance before calculating payroll again.";
  return "Employee saved.";
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeMasterRecord[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const [originalCode, setOriginalCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    employeesApi.list()
      .then((response) => setEmployees(response.employees))
      .catch((caught) => setError(caught instanceof PayrollApiError ? caught.message : "Employees could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      `${employee.employeeCode} ${employee.name}`.toLocaleLowerCase().includes(query),
    );
  }, [employees, search]);

  function openEmployee(employee: EmployeeMasterRecord) {
    setDraft(draftFromEmployee(employee));
    setOriginalCode(employee.employeeCode);
    setError("");
    setNotice("");
  }

  function openNewEmployee() {
    setDraft(emptyDraft);
    setOriginalCode(null);
    setError("");
    setNotice("");
  }

  async function saveEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    const employee: EmployeeMasterRecord = {
      employeeCode: draft.employeeCode.trim(),
      name: draft.name.trim(),
      salary: Number(draft.salary),
      shiftHours: Number(draft.shiftHours) as EmployeeMasterRecord["shiftHours"],
    };
    try {
      const response = originalCode
        ? await employeesApi.update(originalCode, employee)
        : await employeesApi.create(employee);
      setEmployees(response.employees);
      setNotice(statusMessage(response));
      setOriginalCode(employee.employeeCode);
      setDraft(draftFromEmployee(employee));
    } catch (caught) {
      setError(caught instanceof PayrollApiError ? caught.message : "Employee could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee() {
    if (!draft || !originalCode) return;
    const employeeName = draft.name || originalCode;
    if (!window.confirm(`Delete ${employeeName} from the employee master? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await employeesApi.delete(originalCode);
      setEmployees(response.employees);
      setDraft(null);
      setOriginalCode(null);
      setNotice(response.payrollStatus === "invalidated"
        ? "Employee deleted. Review the current payroll before calculating it again."
        : "Employee deleted from the employee master.");
    } catch (caught) {
      setError(caught instanceof PayrollApiError ? caught.message : "Employee could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageShell employeesActive title="Employees" description="Update employee details without editing employee.json." actions={<Button onClick={openNewEmployee}><UserPlus size={16} /> Add employee</Button>}>
      {notice ? <p className="formNotice" role="status">{notice}</p> : null}
      {error && !draft ? <p className="formError" role="alert">{error}</p> : null}
      <div className={draft ? "employeeWorkspace editing" : "employeeWorkspace"}>
        <section className="employeeDirectory">
          <label className="employeeSearch"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or employee ID" aria-label="Search employees" /></label>
          {loading ? <div className="directoryState">Loading employees…</div> : filteredEmployees.length ? (
            <div className="tableFrame"><table className="dataTable employeeTable"><thead><tr><th>Employee</th><th>ID</th><th>Monthly salary</th><th>Shift</th></tr></thead><tbody>{filteredEmployees.map((employee) => <tr key={employee.employeeCode}><td><button className="employeeNameButton" onClick={() => openEmployee(employee)}><strong>{employee.name}</strong><span>Edit details</span></button></td><td className="timeValue">{employee.employeeCode}</td><td className="timeValue">{formatRupees(employee.salary)}</td><td className="timeValue">{employee.shiftHours} hours</td></tr>)}</tbody></table></div>
          ) : <StateMessage title="No employees found." detail={search ? "Try a different name or employee ID." : "Add the first employee to begin."} />}
        </section>

        {draft ? (
          <aside className="employeeEditor" aria-labelledby="employee-editor-title">
            <div className="editorHeading"><div><span>{originalCode ? "Edit employee" : "New employee"}</span><h2 id="employee-editor-title">{draft.name || "Employee details"}</h2></div><button type="button" className="iconButton" onClick={() => { setDraft(null); setError(""); }} aria-label="Close employee editor"><X size={18} /></button></div>
            <form onSubmit={saveEmployee}>
              <label>Employee ID<input required value={draft.employeeCode} onChange={(event) => setDraft({ ...draft, employeeCode: event.target.value })} /></label>
              <label>Employee name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Monthly salary<input required type="number" min="0" step="1" value={draft.salary} onChange={(event) => setDraft({ ...draft, salary: event.target.value })} /></label>
              <label>Shift hours<select value={draft.shiftHours} onChange={(event) => setDraft({ ...draft, shiftHours: event.target.value as EmployeeDraft["shiftHours"] })}><option value="8">8 hours</option><option value="10">10 hours</option><option value="12">12 hours</option></select></label>
              {error ? <p className="formError" role="alert">{error}</p> : null}
              <div className="employeeEditorActions">
                {originalCode ? <Button type="button" variant="danger" disabled={saving || deleting} onClick={deleteEmployee}><Trash2 size={16} /> {deleting ? "Deleting…" : "Delete"}</Button> : null}
                <Button type="submit" disabled={saving || deleting}><Save size={16} /> {saving ? "Saving…" : "Save employee"}</Button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
    </PageShell>
  );
}

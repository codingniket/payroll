"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { PayrollSaveQueue } from "@/lib/payroll-save-queue";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";
import type { PayrollJob } from "@/types/payroll";

export function usePayrollJob() {
  const [job, setJob] = useState<PayrollJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const queue = useRef(new PayrollSaveQueue());

  const acceptJob = useCallback((next: PayrollJob) => {
    queue.current.reset(next); setJob(next);
  }, []);
  const mutate = useCallback(async (operation: (current: PayrollJob) => Promise<PayrollJob>, key = "action") => {
    setPending((count) => count + 1);
    try {
      const next = await queue.current.enqueue(key, operation);
      setJob(next); setError(""); return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
      throw caught;
    } finally { setPending((count) => count - 1); }
  }, []);
  const flush = useCallback(() => queue.current.flush(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      acceptJob(await payrollApi.current());
    } catch (caught) {
      setJob(null);
      setError(caught instanceof PayrollApiError ? caught.message : "Payroll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [acceptJob]);

  useEffect(() => {
    let active = true;
    payrollApi.current()
      .then((currentJob) => {
        if (active) acceptJob(currentJob);
      })
      .catch((caught) => {
        if (!active) return;
        setJob(null);
        setError(caught instanceof PayrollApiError ? caught.message : "Payroll could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [acceptJob]);

  return { job, setJob, loading, error, setError, refresh, mutate, flush, pending };
}

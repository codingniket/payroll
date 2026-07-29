"use client";

import { useCallback, useEffect, useState } from "react";
import { payrollApi, PayrollApiError } from "@/lib/payroll-api";
import type { PayrollJob } from "@/types/payroll";

export function usePayrollJob() {
  const [job, setJob] = useState<PayrollJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setJob(await payrollApi.current());
    } catch (caught) {
      setJob(null);
      setError(caught instanceof PayrollApiError ? caught.message : "Payroll could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    payrollApi.current()
      .then((currentJob) => {
        if (active) setJob(currentJob);
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
  }, []);

  return { job, setJob, loading, error, setError, refresh };
}

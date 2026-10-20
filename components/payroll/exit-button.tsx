"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { payrollApi } from "@/lib/payroll-api";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { PayrollJob } from "@/types/payroll";

export function ExitButton({ beforeExit, disabled }: { beforeExit: () => Promise<PayrollJob>; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [exiting, setExiting] = useState(false);
  return (
    <span>
    <Button
      variant="quiet"
      disabled={disabled || exiting}
      onClick={async () => {
        setExiting(true); setError("");
        try { await payrollApi.exit(await beforeExit()); router.push("/"); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Could not exit payroll."); }
        finally { setExiting(false); }
      }}
    >
      <LogOut size={16} /> Exit
    </Button>
    {error ? <span role="alert" className="formError">{error}</span> : null}
    </span>
  );
}

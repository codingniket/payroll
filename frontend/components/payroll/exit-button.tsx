"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { payrollApi } from "@/lib/payroll-api";
import { Button } from "@/components/ui/button";

export function ExitButton() {
  const router = useRouter();
  return (
    <Button
      variant="quiet"
      onClick={async () => {
        await payrollApi.exit();
        router.push("/");
      }}
    >
      <LogOut size={16} /> Exit
    </Button>
  );
}


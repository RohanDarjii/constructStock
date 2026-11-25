"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { SupplierView } from "../types";

export function SupplierActions({ supplier }: { supplier: SupplierView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const archived = supplier.status === "ARCHIVED";

  async function changeArchive() {
    if (!archived && !window.confirm(`Archive ${supplier.name}? Existing purchase history will be kept.`)) return;
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(`/api/v1/suppliers/${supplier.id}/${archived ? "restore" : "archive"}`, { method: "POST", headers: { "X-CSRF-Token": csrf.data.token } });
      if (!response.ok) {
        const result = await response.json() as { error?: { message: string } };
        throw new Error(result.error?.message ?? "Could not update the supplier.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the supplier.");
    } finally { setPending(false); }
  }

  return <div className="text-right"><button aria-busy={pending} className="cs-secondary disabled:opacity-50" data-loading={pending} disabled={pending} onClick={changeArchive} type="button"><WorkspaceIcon className="h-4 w-4" name={archived ? "check" : "archive"} />{pending ? "Saving…" : archived ? "Restore supplier" : "Archive supplier"}</button>{error && <p aria-live="polite" className="mt-2 max-w-xs text-sm text-red-700">{error}</p>}</div>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { MaterialView } from "../types";

export function MaterialActions({ material }: { material: MaterialView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const archived = material.status === "ARCHIVED";

  async function changeArchive() {
    if (!archived && !window.confirm(`Archive ${material.name}? Existing inventory history will remain available.`)) return;
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(`/api/v1/materials/${material.id}/${archived ? "restore" : "archive"}`, { method: "POST", headers: { "X-CSRF-Token": csrf.data.token } });
      if (!response.ok) {
        const result = await response.json() as { error?: { message: string } };
        throw new Error(result.error?.message ?? "Could not update the material.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the material.");
    } finally { setPending(false); }
  }

  return <div className="text-right"><button className="cs-secondary disabled:opacity-50" disabled={pending} onClick={changeArchive} type="button"><WorkspaceIcon className="h-4 w-4" name={archived ? "check" : "archive"} />{pending ? "Saving…" : archived ? "Restore material" : "Archive material"}</button>{error && <p aria-live="polite" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}

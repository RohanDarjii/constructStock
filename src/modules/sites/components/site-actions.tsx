"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteView } from "../types";

export function SiteActions({ site }: { site: SiteView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const archived = site.status === "ARCHIVED";

  async function changeArchive() {
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(`/api/v1/sites/${site.id}/${archived ? "restore" : "archive"}`, { method: "POST", headers: { "X-CSRF-Token": csrf.data.token } });
      if (!response.ok) {
        const result = await response.json() as { error?: { message: string } };
        throw new Error(result.error?.message ?? "Could not update the site.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the site.");
    } finally {
      setPending(false);
    }
  }

  return <div className="text-right"><button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50" disabled={pending} onClick={changeArchive} type="button">{pending ? "Saving…" : archived ? "Restore site" : "Archive site"}</button>{error && <p aria-live="polite" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}

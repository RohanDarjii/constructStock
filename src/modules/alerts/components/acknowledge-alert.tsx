"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export async function postAcknowledge(alertId: string, note?: string) {
  const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
  if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
  const csrf = await csrfResponse.json() as { data: { token: string } };
  const response = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token }, body: JSON.stringify({ note: note?.trim() || null }) });
  const result = await response.json() as { error?: { message: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Could not acknowledge this alert.");
}

export function AcknowledgeAlert({ alertId, detailed = false }: { alertId: string; detailed?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try { await postAcknowledge(alertId, note); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not acknowledge this alert."); }
    finally { setPending(false); }
  }
  return <form className={detailed ? "space-y-3" : "inline-flex flex-col gap-1"} onSubmit={submit}>
    {detailed && <label className="cs-field">Operational note (optional)<textarea className="cs-input" maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Replenishment requested from supplier" rows={2} value={note} /></label>}
    <button className={`${detailed ? "cs-primary" : "rounded-md border border-[#eae7eb] bg-[#f6f2f7] px-3 py-1.5 text-xs font-bold text-[#144227] hover:bg-[#eae7eb]"} disabled:opacity-50`} disabled={pending} type="submit">{pending ? "Acknowledging…" : detailed ? "Confirm acknowledgment" : "✓ Acknowledge"}</button>
    {error && <span aria-live="polite" className="text-xs text-[#ba1a1a]">{error}</span>}
  </form>;
}

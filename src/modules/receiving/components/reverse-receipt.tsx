"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ReverseReceipt({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = JSON.stringify({ reason: reason.trim() });
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(`/api/v1/goods-receipts/${receiptId}/reverse`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not reverse this receipt.");
      request.current = null; setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reverse this receipt."); }
    finally { setPending(false); }
  }

  return <div><button className="cs-secondary text-[#774149]" onClick={() => setOpen(true)} type="button">Reverse receipt</button>{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><form aria-modal="true" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onSubmit={submit} role="dialog"><h2 className="text-xl font-extrabold">Reverse goods receipt</h2><p className="cs-muted mt-2 text-sm">This keeps the receipt and adds compensating ledger entries. Reversal is blocked if any batch quantity has been used or reserved.</p><label className="cs-field mt-5">Reason *<textarea className="cs-input" maxLength={500} minLength={8} onChange={(event) => setReason(event.target.value)} required rows={4} value={reason} /></label>{error && <p aria-live="polite" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button className="cs-secondary" disabled={pending} onClick={() => setOpen(false)} type="button">Keep receipt</button><button className="cs-primary disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={pending} type="submit">{pending ? "Reversing…" : "Confirm reversal"}</button></div></form></div>}</div>;
}

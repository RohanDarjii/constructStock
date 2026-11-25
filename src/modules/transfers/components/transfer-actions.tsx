"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { TransferStatus } from "../schemas/transfer";

type Action = "approve" | "dispatch" | "receive" | "reject" | "cancel";
const labels: Record<Action, string> = { approve: "Approve & reserve stock", dispatch: "Dispatch transfer", receive: "Receive at destination", reject: "Reject request", cancel: "Cancel transfer" };

export function TransferActions({ transferId, status, canApprove, canDispatch, canReceive, canCancel }: {
  transferId: string; status: TransferStatus; canApprove: boolean; canDispatch: boolean; canReceive: boolean; canCancel: boolean;
}) {
  const router = useRouter();
  const request = useRef<{ action: Action; body: string; key: string } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const choices: Action[] = status === "REQUESTED" ? [canApprove ? "approve" : null, canApprove ? "reject" : null, canCancel ? "cancel" : null].filter((value): value is Action => Boolean(value))
    : status === "APPROVED" ? [canDispatch ? "dispatch" : null, canCancel && canApprove ? "cancel" : null].filter((value): value is Action => Boolean(value))
      : status === "DISPATCHED" && canReceive ? ["receive"] : [];

  async function confirm() {
    if (!action) return;
    if ((action === "reject" || action === "cancel") && reason.trim().length < 8) { setError("Give a reason of at least eight characters."); return; }
    const body = JSON.stringify(action === "reject" || action === "cancel" ? { reason: reason.trim() } : {});
    if (request.current?.action !== action || request.current.body !== body) request.current = { action, body, key: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(`/api/v1/transfers/${transferId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not update transfer.");
      request.current = null; setAction(null); setReason(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update transfer."); }
    finally { setPending(false); }
  }

  if (!choices.length) return null;
  return <div className="flex flex-wrap gap-2">{choices.map((choice) => <button className={choice === "reject" || choice === "cancel" ? "cs-secondary text-[#774149]" : "cs-primary"} key={choice} onClick={() => { setAction(choice); setReason(""); setError(""); }} type="button">{labels[choice]}</button>)}{action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><div aria-modal="true" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" role="dialog"><h2 className="text-xl font-extrabold">{labels[action]}</h2><p className="cs-muted mt-2 text-sm">{action === "approve" ? "Available FIFO batches will be reserved atomically. The source on-hand quantity stays the same." : action === "dispatch" ? "Reserved batches will leave source on-hand and enter organization-owned transit." : action === "receive" ? "Linked batches will be created at the destination and in-transit stock will clear." : "The transfer record will remain in the audit history."}</p>{(action === "reject" || action === "cancel") && <label className="cs-field mt-5">Reason *<textarea className="cs-input" maxLength={500} minLength={8} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label>}{error && <p aria-live="polite" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button className="cs-secondary" disabled={pending} onClick={() => setAction(null)} type="button">Keep current state</button><button className="cs-primary disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={pending} onClick={confirm} type="button">{pending ? "Working…" : `Confirm ${action}`}</button></div></div></div>}</div>;
}

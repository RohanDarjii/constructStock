"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { PurchaseOrderAction } from "../services/purchase-order-service";
import type { PurchaseOrderView } from "../types";

export function PurchaseOrderActions({ order, canCreate, canApprove, canMarkOrdered, canEditDraft }: { order: PurchaseOrderView; canCreate: boolean; canApprove: boolean; canMarkOrdered: boolean; canEditDraft: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PurchaseOrderAction | null>(null);
  const [remarks, setRemarks] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = order.status === "DRAFT" && canCreate && canEditDraft;
  const canCancel = (order.status === "DRAFT" && canEditDraft) || (["APPROVED", "ORDERED"].includes(order.status) && canApprove);

  async function act(action: PurchaseOrderAction, text?: string) {
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const withBody = action === "approve" || action === "reject" || action === "cancel";
      const response = await fetch(`/api/v1/purchase-orders/${order.id}/${action}`, { method: "POST", headers: { "X-CSRF-Token": csrf.data.token, ...(withBody ? { "Content-Type": "application/json" } : {}) }, ...(withBody ? { body: JSON.stringify({ remarks: text ?? "" }) } : {}) });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not update this purchase order.");
      setSelected(null); setRemarks("");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this purchase order."); }
    finally { setPending(false); }
  }

  function submitRemarks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    void act(selected, remarks.trim());
  }

  return <div className="space-y-3"><div className="flex flex-wrap gap-2">
    {order.status === "DRAFT" && canEditDraft && <Link className="cs-secondary" href={`/purchase-orders/${order.id}/edit`}><WorkspaceIcon className="h-4 w-4" name="edit" />Edit draft</Link>}
    {canSubmit && <button className="cs-primary disabled:opacity-50" disabled={pending} onClick={() => void act("submit")} type="button">Submit for approval</button>}
    {order.status === "PENDING_APPROVAL" && canApprove && <><button className="cs-primary disabled:opacity-50" disabled={pending} onClick={() => { setSelected("approve"); setRemarks(""); }} type="button"><WorkspaceIcon className="h-4 w-4" name="shield" />Approve</button><button className="cs-secondary disabled:opacity-50" disabled={pending} onClick={() => { setSelected("reject"); setRemarks(""); }} type="button">Reject</button></>}
    {order.status === "APPROVED" && canMarkOrdered && <button className="cs-primary disabled:opacity-50" disabled={pending} onClick={() => void act("mark-ordered")} type="button">Mark ordered</button>}
    {canCancel && <button className="cs-secondary disabled:opacity-50" disabled={pending} onClick={() => { setSelected("cancel"); setRemarks(""); }} type="button">Cancel order</button>}
  </div>{selected && <form className="cs-panel w-full max-w-md space-y-3 p-4" onSubmit={submitRemarks}><h2 className="text-sm font-bold capitalize">{selected} purchase order</h2><label className="cs-field">{selected === "approve" ? "Approval remarks (optional)" : "Reason *"}<textarea className="cs-input" maxLength={500} minLength={selected === "approve" ? undefined : 8} onChange={(event) => setRemarks(event.target.value)} required={selected !== "approve"} rows={3} value={remarks} /></label><div className="flex gap-2"><button className="cs-primary disabled:opacity-50" disabled={pending} type="submit">{pending ? "Updating…" : `Confirm ${selected}`}</button><button className="cs-secondary" onClick={() => setSelected(null)} type="button">Back</button></div></form>}{error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div>;
}

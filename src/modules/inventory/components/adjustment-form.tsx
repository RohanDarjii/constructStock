"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { MaterialUnit } from "@/modules/materials/types";

type Option = { id: string; name: string; code: string };
type MaterialOption = Option & { unit: MaterialUnit };

export function AdjustmentForm({ sites, materials, currencyCode }: { sites: Option[]; materials: MaterialOption[]; currencyCode: string }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [reasonCode, setReasonCode] = useState("OPENING_STOCK");
  const [materialId, setMaterialId] = useState(materials[0].id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const unit = materials.find((material) => material.id === materialId)?.unit;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      siteId: String(form.get("siteId") ?? ""), materialId: String(form.get("materialId") ?? ""), direction,
      quantity: String(form.get("quantity") ?? "").trim(), reasonCode, remarks: String(form.get("remarks") ?? "").trim(),
      ...(direction === "IN" ? { unitCost: String(form.get("unitCost") ?? "").trim() } : {}),
    };
    const body = JSON.stringify(payload);
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch("/api/v1/inventory/adjustments", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not record the adjustment.");
      request.current = null;
      router.push(`/inventory?view=balances&siteId=${payload.siteId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the adjustment.");
      setPending(false);
    }
  }

  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="space-y-5"><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="sites" />Stock location</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Site *<select className="cs-input" name="siteId" required>{sites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select></label><label className="cs-field">Material *<select className="cs-input" name="materialId" onChange={(event) => setMaterialId(event.target.value)} required value={materialId}>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label></div><p className="cs-muted mt-3 text-xs">Selected unit: {unit}</p></section>
      <section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="inventory" />Stock change</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Direction *<select className="cs-input" onChange={(event) => { const value = event.target.value as "IN" | "OUT"; setDirection(value); setReasonCode(value === "IN" ? "OPENING_STOCK" : "PHYSICAL_COUNT_CORRECTION"); }} value={direction}><option value="IN">Add stock</option><option value="OUT">Remove stock</option></select></label><label className="cs-field">Quantity ({unit}) *<input className="cs-input" inputMode="decimal" maxLength={20} name="quantity" placeholder={unit === "BAG" || unit === "PIECE" ? "10" : "10.500"} required /></label>{direction === "IN" && <label className="cs-field sm:col-span-2">Unit cost ({currencyCode}) *<input className="cs-input" inputMode="decimal" maxLength={20} name="unitCost" placeholder="25.00" required /></label>}</div><p className="cs-muted mt-3 text-xs">Bags and pieces use whole numbers; measured materials support up to three decimals. Removing stock uses FIFO and excludes reserved quantities.</p></section></div>
      <aside className="cs-panel h-fit p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Reason &amp; audit</h2><div className="mt-5 space-y-4"><label className="cs-field">Reason *<select className="cs-input" onChange={(event) => setReasonCode(event.target.value)} value={reasonCode}>{direction === "IN" && <option value="OPENING_STOCK">Opening stock</option>}<option value="PHYSICAL_COUNT_CORRECTION">Physical count correction</option><option value="OTHER">Other</option></select></label><label className="cs-field">Explanation *<textarea className="cs-input" maxLength={500} minLength={8} name="remarks" placeholder="Describe the count or source of the opening stock" required rows={5} /></label></div><p className="cs-muted mt-4 text-xs leading-5">This entry updates the batch, balance, ledger, and audit history together. Stock history cannot be deleted.</p></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex justify-end gap-3 p-4"><Link className="cs-secondary" href="/inventory">Cancel</Link><button className="cs-primary disabled:opacity-50" disabled={pending} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />{pending ? "Recording…" : "Record adjustment"}</button></div>
  </form>;
}

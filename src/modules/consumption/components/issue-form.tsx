"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { LoadingRing } from "@/components/feedback/loading-ring";
import type { ConsumptionMutationResult, IssueOptions } from "../types";

const D = Decimal.clone({ precision: 80 });
const quantityPattern = /^\d{1,16}(?:\.\d{1,3})?$/;
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function IssueForm({ initialOptions, currencyCode, canManual }: { initialOptions: IssueOptions; currencyCode: string; canManual: boolean }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const loadSequence = useRef(0);
  const [options, setOptions] = useState(initialOptions);
  const [siteId, setSiteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [activity, setActivity] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [contractor, setContractor] = useState("");
  const [description, setDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [method, setMethod] = useState<"FIFO" | "MANUAL">("FIFO");
  const [manualQuantities, setManualQuantities] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  const site = options.sites.find((entry) => entry.id === siteId);
  const material = options.materials.find((entry) => entry.id === materialId);
  const validQuantity = quantityPattern.test(quantity) && new D(quantity).gt(0);
  const requested = validQuantity ? new D(quantity) : new D(0);
  const preview = options.batches.reduce<{ id: string; batchCode: string; receivedAt: string; remaining: string; available: string; unitCost: string; quantity: string; value: string }[]>((entries, batch) => {
    const used = entries.reduce((sum, entry) => sum.plus(entry.quantity), new D(0));
    const entered = manualQuantities[batch.id] ?? "";
    const amount = method === "MANUAL" ? quantityPattern.test(entered) ? new D(entered) : new D(0) : D.min(D.max(requested.minus(used), 0), new D(batch.available));
    if (amount.lte(0)) return entries;
    const value = money(new D(batch.remaining).times(batch.unitCost)).minus(money(new D(batch.remaining).minus(amount).times(batch.unitCost)));
    return [...entries, { ...batch, quantity: amount.toString(), value: value.toFixed(2) }];
  }, []);
  const previewQuantity = preview.reduce((sum, entry) => sum.plus(entry.quantity), new D(0));
  const previewValue = preview.reduce((sum, entry) => sum.plus(entry.value), new D(0));
  const available = new D(options.stock?.available ?? "0");
  const after = available.minus(requested);
  const overIssue = validQuantity && requested.gt(available);

  async function load(nextSiteId: string, nextMaterialId = ""): Promise<IssueOptions | null> {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (nextSiteId) params.set("siteId", nextSiteId);
    if (nextMaterialId) params.set("materialId", nextMaterialId);
    try {
      const response = await fetch(`/api/v1/consumptions/options?${params}`, { cache: "no-store" });
      const body = await response.json() as { data?: IssueOptions; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not load site stock.");
      if (sequence === loadSequence.current) setOptions(body.data);
      return body.data;
    } catch (cause) {
      if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : "Could not load site stock.");
      return null;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  function chooseSite(next: string) {
    loadSequence.current++;
    setLoading(false);
    setSiteId(next); setMaterialId(""); setQuantity(""); setMethod("FIFO"); setManualQuantities({}); setError("");
    setOptions({ sites: options.sites, materials: [], stock: null, batches: [] });
    if (next) void load(next);
  }

  function chooseMaterial(next: string) {
    loadSequence.current++;
    setLoading(false);
    setMaterialId(next); setQuantity(""); setMethod("FIFO"); setManualQuantities({}); setError("");
    setOptions((current) => ({ ...current, stock: null, batches: [] }));
    if (next) void load(siteId, next);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!siteId || !materialId || !material || !options.stock) { setError("Choose a site and material with current stock."); return; }
    if (!validQuantity || ((material.unit === "BAG" || material.unit === "PIECE") && !requested.isInteger())) { setError(`Enter a valid quantity in ${material.unit}.`); return; }
    if (overIssue || !requested.eq(previewQuantity)) { setError("Requested quantity exceeds available batch stock or does not match the selected allocations. Refresh the stock view or change the quantity."); return; }
    if (method === "MANUAL") {
      if (!canManual || overrideReason.trim().length < 8) { setError("Provide an authorized manual allocation reason of at least eight characters."); return; }
      if (preview.some((entry) => new D(entry.quantity).gt(entry.available))) { setError("A selected batch has insufficient available quantity."); return; }
    }
    if (!issuedAt || Number.isNaN(new Date(issuedAt).getTime())) { setError("Choose a valid issue date and time."); return; }
    setError(""); setConfirmOpen(true);
  }

  async function confirm() {
    if (!options.stock) return;
    setPending(true); setError("");
    try {
      const payload = {
        siteId, materialId, quantity: quantity.trim(), issuedAt: new Date(issuedAt).toISOString(),
        activity: activity.trim(), issuedTo: issuedTo.trim(), contractor: contractor.trim() || null,
        description: description.trim() || null, remarks: remarks.trim() || null,
        allocationMethod: method,
        ...(method === "MANUAL" ? { batchAllocations: preview.map((entry) => ({ batchId: entry.id, quantity: entry.quantity })), overrideReason: overrideReason.trim() } : {}),
      };
      const body = JSON.stringify(payload);
      const retry = request.current?.body === body;
      if (!retry) {
        const latest = await load(siteId, materialId);
        if (!latest) throw new Error("Could not verify the current stock. Try again.");
        if (!latest.stock || latest.stock.version !== options.stock.version) {
          setConfirmOpen(false);
          throw new Error("Site stock changed while this form was open. Review the updated availability and allocations before confirming.");
        }
      }
      if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch("/api/v1/consumptions", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { data?: ConsumptionMutationResult; error?: { code?: string; message: string } };
      if (!response.ok || !result.data) {
        if (["INSUFFICIENT_STOCK", "INVENTORY_VERSION_CONFLICT", "CONSUMPTION_CONFLICT"].includes(result.error?.code ?? "")) {
          setConfirmOpen(false);
          void load(siteId, materialId);
        }
        throw new Error(result.error?.message ?? "Could not confirm this issue.");
      }
      request.current = null;
      router.push(`/consumptions/${result.data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm this issue.");
      setPending(false);
    }
  }

  return <form className="space-y-5" onSubmit={review}>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_340px]">
      <div className="space-y-5">
        <section className="cs-panel cs-form-section p-5 sm:p-6">
          <div className="flex items-center gap-2"><WorkspaceIcon className="h-5 w-5 text-[#144227]" name="sites" /><h2 className="text-lg font-extrabold">Jobsite &amp; material selection</h2></div>
          <p className="cs-muted mt-1 text-xs">Choose an assigned worksite, then the material being issued.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="cs-field">Construction site *<select className="cs-input" onChange={(event) => chooseSite(event.target.value)} required value={siteId}><option value="">Select a site</option>{options.sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label>
            <label className="cs-field">Material *<select className="cs-input" disabled={!siteId || loading} onChange={(event) => chooseMaterial(event.target.value)} required value={materialId}><option value="">{loading ? "Loading materials…" : "Select material"}</option>{options.materials.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label>
          </div>
          {loading && <p aria-live="polite" className="cs-muted mt-4 flex items-center gap-2 text-xs" role="status"><LoadingRing small /> Loading current site stock…</p>}
          {material && !loading && <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded bg-[#f6f2f7] p-4"><p className="cs-eyebrow">On hand</p><p className="mt-2 text-xl font-extrabold">{options.stock?.onHand ?? "0"} <span className="text-xs">{material.unit}</span></p></div><div className="rounded bg-[#f6f2f7] p-4"><p className="cs-eyebrow">Reserved</p><p className="mt-2 text-xl font-extrabold">{options.stock?.reserved ?? "0"} <span className="text-xs">{material.unit}</span></p></div><div className="rounded bg-[#e8f3eb] p-4"><p className="cs-eyebrow">Available to issue</p><p className="mt-2 text-xl font-extrabold text-[#144227]">{options.stock?.available ?? "0"} <span className="text-xs">{material.unit}</span></p></div></div>}
        </section>
        <section className="cs-panel cs-form-section p-5 sm:p-6">
          <div className="flex items-center gap-2"><WorkspaceIcon className="h-5 w-5 text-[#144227]" name="consumption" /><h2 className="text-lg font-extrabold">Issue &amp; recipient details</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="cs-field">Issue quantity {material ? `(${material.unit})` : ""} *<input className={`cs-input ${overIssue ? "border-red-400" : ""}`} inputMode="decimal" maxLength={20} onChange={(event) => { setQuantity(event.target.value); setError(""); }} placeholder="0" required value={quantity} /></label>
            <label className="cs-field">Issue date &amp; time *<input className="cs-input" onChange={(event) => setIssuedAt(event.target.value)} required type="datetime-local" value={issuedAt} /></label>
            <label className="cs-field">Construction activity *<input className="cs-input" list="construction-activities" maxLength={120} minLength={2} onChange={(event) => setActivity(event.target.value)} placeholder="First Floor Slab" required value={activity} /><datalist id="construction-activities">{["Foundation", "Ground Floor Slab", "First Floor Slab", "Brickwork", "Plastering", "Flooring", "Painting", "Electrical Installation"].map((value) => <option key={value} value={value} />)}</datalist></label>
            <label className="cs-field">Issued to *<input className="cs-input" maxLength={120} minLength={2} onChange={(event) => setIssuedTo(event.target.value)} placeholder="Person or team" required value={issuedTo} /></label>
            <label className="cs-field">Contractor, if applicable<input className="cs-input" maxLength={120} onChange={(event) => setContractor(event.target.value)} placeholder="Contractor name" value={contractor} /></label>
            <label className="cs-field">Description<input className="cs-input" maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="Work package or location" value={description} /></label>
            <label className="cs-field sm:col-span-2">Handover remarks<textarea className="cs-input" maxLength={2000} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional issue notes" rows={3} value={remarks} /></label>
          </div>
          {overIssue && <div className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"><strong>Issue blocked.</strong> Requested {quantity} {material?.unit} exceeds {options.stock?.available ?? "0"} available. Reserved stock cannot be issued.</div>}
        </section>
        <section className="cs-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="text-lg font-extrabold">Batch allocation preview</h2><p className="cs-muted mt-1 text-xs">Oldest eligible batches are used first. Final allocation is verified when posted.</p></div><span className="cs-badge">{method === "FIFO" ? "Automatic FIFO" : "Manual selection"}</span></div>
          {canManual && <div className="flex gap-2 border-t border-[#f0edf1] px-5 py-3"><button aria-pressed={method === "FIFO"} className={method === "FIFO" ? "cs-primary" : "cs-secondary"} onClick={() => { setMethod("FIFO"); setError(""); }} type="button">Automatic FIFO</button><button aria-pressed={method === "MANUAL"} className={method === "MANUAL" ? "cs-primary" : "cs-secondary"} onClick={() => { setMethod("MANUAL"); setError(""); }} type="button">Select batches manually</button></div>}
          {method === "MANUAL" && <div className="border-t border-[#f0edf1] px-5 py-4"><label className="cs-field">Reason for manual selection *<textarea className="cs-input" maxLength={500} minLength={8} onChange={(event) => setOverrideReason(event.target.value)} rows={2} value={overrideReason} /></label></div>}
          <div className="overflow-x-auto"><table className="cs-data-table min-w-[640px]"><thead><tr><th>Inventory batch</th><th>Available</th><th>{method === "FIFO" ? "FIFO allocation" : "Quantity to issue"}</th><th>Unit cost</th><th>Estimated value</th></tr></thead><tbody>{options.batches.map((batch) => { const row = preview.find((entry) => entry.id === batch.id); return <tr key={batch.id}><td><strong className="font-mono">{batch.batchCode}</strong><span className="cs-muted block text-[11px]">Received {new Date(batch.receivedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}</span></td><td>{batch.available} {material?.unit}</td><td>{method === "MANUAL" ? <input aria-label={`Quantity from ${batch.batchCode}`} className="cs-input max-w-28" inputMode="decimal" onChange={(event) => setManualQuantities((current) => ({ ...current, [batch.id]: event.target.value }))} value={manualQuantities[batch.id] ?? ""} /> : <strong>{row?.quantity ?? "0"} {material?.unit}</strong>}</td><td>{currencyCode} {batch.unitCost}</td><td>{currencyCode} {row?.value ?? "0.00"}</td></tr>; })}</tbody></table>{!options.batches.length && <p className="cs-muted p-8 text-center text-sm">{materialId ? "No available batches at this site for this material." : "Choose a site and material to see FIFO batches."}</p>}</div>
        </section>
      </div>
      <aside className="space-y-5"><section className="cs-panel p-6"><h2 className="text-xl font-extrabold">Issue summary</h2><p className="cs-muted mt-1 text-xs">From this site&apos;s available stock</p><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>Site</dt><dd className="text-right font-bold">{site?.name ?? "Choose site"}</dd></div><div className="flex justify-between gap-3"><dt>Material</dt><dd className="text-right font-bold">{material?.name ?? "Choose material"}</dd></div><div className="flex justify-between"><dt>Requested</dt><dd className="font-bold">{quantity || "0"} {material?.unit}</dd></div><div className="flex justify-between"><dt>Available after</dt><dd className={overIssue ? "font-bold text-red-700" : "font-bold text-[#144227]"}>{after.gte(0) ? after.toString() : "—"} {material?.unit}</dd></div></dl><div className="mt-6 rounded bg-[#144227] p-5 text-white"><p className="text-xs font-semibold text-[#bceec8]">Estimated value depleted</p><p className="mt-2 text-2xl font-extrabold">{currencyCode} {previewValue.toFixed(2)}</p></div></section><section className="cs-panel p-6"><h2 className="cs-eyebrow">Stock integrity</h2><p className="cs-muted mt-3 text-xs leading-5">Available equals on-hand minus reserved. Issues cannot use reserved stock or create negative inventory. Final FIFO and value are calculated in one database transaction.</p><button className="mt-4 text-xs font-bold text-[#144227] underline disabled:opacity-50" aria-busy={loading} data-loading={loading} disabled={!siteId || !materialId || loading} onClick={() => void load(siteId, materialId)} type="button">Refresh current stock</button></section></aside>
    </div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap justify-end gap-3 p-4"><Link className="cs-secondary" href="/consumptions">Back to register</Link><button className="cs-primary disabled:opacity-50" disabled={pending || loading || overIssue || !options.stock} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />Review material issue</button></div>
    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><div aria-modal="true" className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" role="dialog"><h2 className="text-xl font-extrabold">Review Material Issue Confirmation</h2><p className="cs-muted mt-2 text-sm">Confirmation immediately deducts available site stock.</p><div className="mt-5 grid gap-4 rounded bg-[#f6f2f7] p-5 text-sm sm:grid-cols-2"><div><p className="cs-eyebrow">Jobsite</p><p className="mt-1 font-bold">{site?.name}</p></div><div><p className="cs-eyebrow">Material</p><p className="mt-1 font-bold">{material?.name}</p></div><div><p className="cs-eyebrow">Issue quantity</p><p className="mt-1 text-lg font-extrabold text-[#144227]">{quantity} {material?.unit}</p></div><div><p className="cs-eyebrow">Available stock</p><p className="mt-1 font-bold">{options.stock?.available} → {after.toString()} {material?.unit}</p></div><div><p className="cs-eyebrow">Issued to</p><p className="mt-1 font-bold">{issuedTo}{contractor ? ` · ${contractor}` : ""}</p></div><div><p className="cs-eyebrow">Activity</p><p className="mt-1 font-bold">{activity}</p></div></div><p className="mt-5 rounded bg-[#e8f3eb] p-4 text-right font-bold text-[#144227]">Estimated FIFO stock value: {currencyCode} {previewValue.toFixed(2)}</p><p className="cs-muted mt-3 text-xs">The server verifies current stock before posting. A retry uses the same idempotency key.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button className="cs-secondary" disabled={pending} onClick={() => setConfirmOpen(false)} type="button">Back to edit</button><button className="cs-primary disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={pending} onClick={() => void confirm()} type="button">{pending ? "Posting issue…" : "Confirm issue & deduct stock"}</button></div></div></div>}
  </form>;
}

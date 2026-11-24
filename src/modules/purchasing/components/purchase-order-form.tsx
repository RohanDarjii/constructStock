"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { pricePurchaseOrder } from "../pricing";
import type { PurchaseOrderView } from "../types";

type Options = {
  sites: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; code: string; name: string; paymentTerms: string | null }>;
  materials: Array<{ id: string; code: string; name: string; unit: string }>;
};
type Line = { key: string; materialId: string; quantityOrdered: string; unitPrice: string; taxRate: string };
type ApiResult = { data?: PurchaseOrderView; error?: { message: string; details?: { fields?: Record<string, string[]> } } };

export function PurchaseOrderForm({ options, currencyCode, order }: { options: Options; currencyCode: string; order?: PurchaseOrderView }) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(order?.site.id ?? options.sites[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(order?.supplier.id ?? options.suppliers[0]?.id ?? "");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(order?.expectedDeliveryDate ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(order ? order.items.map((line) => ({ key: line.id, materialId: line.material.id, quantityOrdered: line.quantityOrdered, unitPrice: line.unitPrice, taxRate: line.taxRate })) : [{ key: "first-line", materialId: options.materials[0]?.id ?? "", quantityOrdered: "", unitPrice: "", taxRate: "0" }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const supplier = options.suppliers.find((item) => item.id === supplierId);
  let estimate: ReturnType<typeof pricePurchaseOrder> | null = null;
  try {
    if (lines.every((line) => line.quantityOrdered && line.unitPrice && line.taxRate)) estimate = pricePurchaseOrder(lines);
  } catch { estimate = null; }
  const uniqueMaterials = new Set(lines.map((line) => line.materialId)).size === lines.length;
  const validQuantities = lines.every((line) => {
    const unit = options.materials.find((material) => material.id === line.materialId)?.unit;
    if (!unit || !/^\d{1,16}(?:\.\d{1,3})?$/.test(line.quantityOrdered)) return false;
    const quantity = new Decimal(line.quantityOrdered);
    return quantity.gt(0) && (unit === "BAG" || unit === "PIECE" ? quantity.isInteger() : true);
  });
  const validPrices = lines.every((line) => /^\d{1,16}(?:\.\d{1,2})?$/.test(line.unitPrice) && /^\d{1,3}(?:\.\d{1,4})?$/.test(line.taxRate) && new Decimal(line.taxRate).lte(100));
  const ready = Boolean(siteId && supplierId && lines.length && lines.length <= 30 && uniqueMaterials && validQuantities && validPrices);

  function changeLine(key: string, field: keyof Omit<Line, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const ids = lines.map((line) => line.materialId);
    if (new Set(ids).size !== ids.length) { setError("Add each material only once."); return; }
    for (const line of lines) {
      const unit = options.materials.find((material) => material.id === line.materialId)?.unit;
      try {
        const quantity = new Decimal(line.quantityOrdered);
        if (!quantity.gt(0) || ((unit === "BAG" || unit === "PIECE") && !quantity.isInteger()) || quantity.decimalPlaces() > 3) {
          setError("Check the quantity precision for each material unit."); return;
        }
      } catch { setError("Enter a valid quantity for each material."); return; }
    }
    setPending(true);
    setError("");
    const payload = { siteId, supplierId, expectedDeliveryDate: expectedDeliveryDate || null, notes: notes.trim() || null, items: lines.map(({ materialId, quantityOrdered, unitPrice, taxRate }) => ({ materialId, quantityOrdered: quantityOrdered.trim(), unitPrice: unitPrice.trim(), taxRate: taxRate.trim() })) };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(order ? `/api/v1/purchase-orders/${order.id}` : "/api/v1/purchase-orders", { method: order ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token }, body: JSON.stringify(payload) });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) {
        const first = Object.entries(result.error?.details?.fields ?? {}).find(([, messages]) => messages?.length);
        throw new Error(first ? `${first[0]}: ${first[1][0]}` : result.error?.message ?? "Could not save this draft.");
      }
      const saved = result.data;
      if (intent === "submit") {
        const submitted = await fetch(`/api/v1/purchase-orders/${saved.id}/submit`, { method: "POST", headers: { "X-CSRF-Token": csrf.data.token } });
        if (!submitted.ok) {
          const failure = await submitted.json() as ApiResult;
          throw new Error(`Draft ${saved.poNumber} was saved, but submission failed: ${failure.error?.message ?? "Please retry from the order detail."}`);
        }
      }
      router.push(`/purchase-orders/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this purchase order.");
      setPending(false);
    }
  }

  return <form className="space-y-6" onSubmit={submit}>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_340px]"><div className="space-y-5">
      <section className="cs-panel p-5 sm:p-6"><div className="flex flex-wrap items-center gap-3"><span className="cs-eyebrow rounded bg-[#f0edf1] px-3 py-2">01 Header &amp; destination</span><h2 className="text-sm font-bold">Procurement scope</h2></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Receiving jobsite *<select className="cs-input" onChange={(event) => setSiteId(event.target.value)} required value={siteId}>{options.sites.map((site) => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select></label><label className="cs-field">Commercial supplier *<select className="cs-input" onChange={(event) => setSupplierId(event.target.value)} required value={supplierId}>{options.suppliers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>{supplier?.paymentTerms && <span className="cs-muted text-[11px]">Payment terms: {supplier.paymentTerms}</span>}</label><label className="cs-field">Expected delivery date<input className="cs-input" onChange={(event) => setExpectedDeliveryDate(event.target.value)} type="date" value={expectedDeliveryDate} /></label><label className="cs-field sm:col-span-2">Operational notes<textarea className="cs-input" maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Delivery instructions and order notes" rows={4} value={notes} /></label></div></section>
      <section className="cs-panel p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="cs-eyebrow rounded bg-[#f0edf1] px-3 py-2">02 Ordered material line items</span><p className="cs-muted mt-4 text-xs">BAG and PIECE quantities are whole numbers; measured units allow three decimals. Prices use two decimals and tax rates four.</p></div><span className="cs-badge">{lines.length} active {lines.length === 1 ? "line" : "lines"}</span></div><div className="mt-5 space-y-3">{lines.map((line, index) => { const material = options.materials.find((item) => item.id === line.materialId); return <div className="rounded-lg bg-[#f6f2f7] p-4" key={line.key}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs font-bold">{index + 1}</span><strong className="text-sm">{material?.name ?? "Select material"}</strong></div><button aria-label={`Remove line ${index + 1}`} className="cs-muted text-xs font-bold hover:text-red-700 disabled:opacity-40" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} type="button">Remove</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_90px_1fr_1fr_1fr]"><label className="cs-field">Material *<select className="cs-input" onChange={(event) => changeLine(line.key, "materialId", event.target.value)} required value={line.materialId}>{options.materials.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label className="cs-field">Unit<input className="cs-input bg-[#eae7eb]" readOnly value={material?.unit ?? ""} /></label><label className="cs-field">Quantity *<input className="cs-input" inputMode="decimal" maxLength={20} onChange={(event) => changeLine(line.key, "quantityOrdered", event.target.value)} placeholder="0" required value={line.quantityOrdered} /></label><label className="cs-field">Unit price ({currencyCode}) *<input className="cs-input" inputMode="decimal" maxLength={20} onChange={(event) => changeLine(line.key, "unitPrice", event.target.value)} placeholder="0.00" required value={line.unitPrice} /></label><label className="cs-field">Tax rate (%) *<input className="cs-input" inputMode="decimal" maxLength={8} onChange={(event) => changeLine(line.key, "taxRate", event.target.value)} required value={line.taxRate} /></label></div>{estimate && <p className="mt-3 text-right text-xs font-semibold text-[#144227]">Line estimate: {currencyCode} {estimate.lines[index].grandTotal}</p>}</div>; })}</div><button className="cs-secondary mt-4 w-full disabled:opacity-50" disabled={lines.length >= 30 || lines.length >= options.materials.length} onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), materialId: options.materials.find((item) => !current.some((line) => line.materialId === item.id))!.id, quantityOrdered: "", unitPrice: "", taxRate: "0" }])} type="button"><WorkspaceIcon className="h-4 w-4" name="plus" />Add material line item</button></section>
    </div><aside className="space-y-5"><section className="cs-panel p-6"><h2 className="text-xl font-extrabold">Commercial Breakdown</h2><p className="cs-muted mt-1 text-xs">Draft estimate · server totals are authoritative</p><dl className="mt-6 space-y-4 text-sm"><div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="font-bold">{currencyCode} {estimate?.subtotal ?? "0.00"}</dd></div><div className="flex justify-between gap-3 rounded bg-[#f6f2f7] p-3"><dt>Estimated tax</dt><dd className="font-bold">{currencyCode} {estimate?.taxTotal ?? "0.00"}</dd></div></dl><div className="mt-6 rounded-lg bg-[#144227] p-5 text-white"><p className="text-[11px] font-bold uppercase tracking-wider text-[#bceec8]">Grand total (estimated)</p><p className="mt-2 text-3xl font-extrabold">{currencyCode} {estimate?.grandTotal ?? "0.00"}</p></div></section><section className="cs-panel p-6"><h2 className="cs-eyebrow">Pre-approval validation</h2><ul className="mt-4 space-y-3 text-xs text-[#414942]"><li>{siteId && supplierId ? "✓" : "○"} Receiving site and supplier selected</li><li>{validQuantities ? "✓" : "○"} Quantities match catalogue units</li><li>{uniqueMaterials ? "✓" : "○"} Each material appears once</li><li>{validPrices ? "✓" : "○"} Prices and tax rates are valid</li></ul><p className="cs-muted mt-4 text-xs">Inventory changes only after goods receiving.</p></section></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap items-center justify-end gap-3 p-4"><Link className="cs-secondary" href={order ? `/purchase-orders/${order.id}` : "/purchase-orders"}>Discard</Link><button className="cs-secondary disabled:opacity-50" disabled={pending || !ready} name="intent" type="submit" value="draft"><WorkspaceIcon className="h-4 w-4" name="check" />{pending ? "Saving…" : "Save draft"}</button><button className="cs-primary disabled:opacity-50" disabled={pending || !ready} name="intent" type="submit" value="submit"><WorkspaceIcon className="h-4 w-4" name="shield" />Save &amp; submit for approval</button></div>
  </form>;
}

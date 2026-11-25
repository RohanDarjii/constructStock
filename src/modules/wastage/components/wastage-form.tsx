"use client";

import { upload } from "@vercel/blob/client";
import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { maxWastagePhotoBytes } from "@/modules/files/schemas/file-attachment";
import { wastageReasonLabels, wastageReasons, type WastageReason } from "../schemas/wastage";
import type { WastageMutationResult, WastageOptions } from "../types";

const D = Decimal.clone({ precision: 80 });
const quantityPattern = /^\d{1,16}(?:\.\d{1,3})?$/;
const allowedImages = ["image/jpeg", "image/png", "image/webp"];
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
type PendingPhoto = { file: File; siteId: string; id: string; fileKey: string; uploaded: boolean; ready: boolean };

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("Your session expired. Sign in again.");
  const body = await response.json() as { data: { token: string } };
  return body.data.token;
}

export function WastageForm({ initialOptions, currencyCode, canManual }: { initialOptions: WastageOptions; currencyCode: string; canManual: boolean }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const pendingPhoto = useRef<PendingPhoto | null>(null);
  const loadSequence = useRef(0);
  const [options, setOptions] = useState(initialOptions);
  const [siteId, setSiteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [wastedAt, setWastedAt] = useState("");
  const [reason, setReason] = useState<WastageReason>("BREAKAGE");
  const [activity, setActivity] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
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
  const preview = options.batches.reduce<Array<(typeof options.batches)[number] & { quantity: string; value: string }>>((entries, batch) => {
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
  const overStock = validQuantity && requested.gt(available);

  async function load(nextSiteId: string, nextMaterialId = ""): Promise<WastageOptions | null> {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (nextSiteId) params.set("siteId", nextSiteId);
    if (nextMaterialId) params.set("materialId", nextMaterialId);
    try {
      const response = await fetch(`/api/v1/wastages/options?${params}`, { cache: "no-store" });
      const body = await response.json() as { data?: WastageOptions; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not load site stock.");
      if (sequence === loadSequence.current) setOptions(body.data);
      return body.data;
    } catch (cause) {
      if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : "Could not load site stock.");
      return null;
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }

  function chooseSite(next: string) {
    loadSequence.current++;
    setLoading(false); setSiteId(next); setMaterialId(""); setQuantity(""); setMethod("FIFO"); setManualQuantities({}); setPhoto(null); pendingPhoto.current = null; request.current = null; setError("");
    setOptions({ sites: options.sites, materials: [], stock: null, batches: [] });
    if (next) void load(next);
  }

  function chooseMaterial(next: string) {
    loadSequence.current++;
    setLoading(false); setMaterialId(next); setQuantity(""); setMethod("FIFO"); setManualQuantities({}); request.current = null; setError("");
    setOptions((current) => ({ ...current, stock: null, batches: [] }));
    if (next) void load(siteId, next);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!siteId || !materialId || !material || !options.stock) return setError("Choose a site and material with available stock.");
    if (!validQuantity || ((material.unit === "BAG" || material.unit === "PIECE") && !requested.isInteger())) return setError(`Enter a valid quantity in ${material.unit}.`);
    if (overStock || !requested.eq(previewQuantity)) return setError("Quantity exceeds available stock or selected batch allocations. Refresh stock and review the quantity.");
    if (method === "MANUAL" && (!canManual || overrideReason.trim().length < 8 || preview.some((entry) => new D(entry.quantity).gt(entry.available)))) return setError("Manual batch selection needs an authorized reason and available batch quantities.");
    if (!wastedAt || Number.isNaN(new Date(wastedAt).getTime())) return setError("Choose a valid wastage date and time.");
    if (photo && (!allowedImages.includes(photo.type) || photo.size > maxWastagePhotoBytes || photo.size === 0)) return setError("Choose a JPEG, PNG, or WebP photo up to 10 MB.");
    setError(""); setConfirmOpen(true);
  }

  async function attachPhoto(file: File, token: string): Promise<string> {
    let item = pendingPhoto.current;
    const retry = Boolean(item && item.file === file && item.siteId === siteId);
    if (!item || item.file !== file || item.siteId !== siteId) {
      const response = await fetch("/api/v1/files", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ siteId, fileName: file.name, mimeType: file.type, size: file.size }) });
      const body = await response.json() as { data?: { id: string; fileKey: string }; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not prepare the photo upload.");
      item = { file, siteId, id: body.data.id, fileKey: body.data.fileKey, uploaded: false, ready: false };
      pendingPhoto.current = item;
    }
    async function finalize(): Promise<boolean> {
      if (!item) return false;
      const response = await fetch(`/api/v1/files/${item.id}/finalize`, { method: "POST", headers: { "X-CSRF-Token": token } });
      const body = await response.json() as { error?: { code?: string; message: string } };
      if (response.status === 409 && body.error?.code === "UPLOAD_NOT_COMPLETE") return false;
      if (!response.ok) throw new Error(body.error?.message ?? "Photo upload could not be finalized. Retry to continue.");
      item.ready = true;
      return true;
    }
    if (!item.uploaded) {
      if (retry && await finalize()) return item.id;
      try { await upload(item.fileKey, file, { access: "private", handleUploadUrl: "/api/v1/files/upload", clientPayload: JSON.stringify({ attachmentId: item.id }), headers: { "X-CSRF-Token": token } }); }
      catch (cause) { if (await finalize()) return item.id; throw cause; }
      item.uploaded = true;
    }
    if (!item.ready && !await finalize()) throw new Error("Photo upload is not complete yet. Retry to continue.");
    return item.id;
  }

  async function confirm() {
    if (!options.stock) return;
    setPending(true); setError("");
    try {
      const latest = await load(siteId, materialId);
      if (!latest?.stock) throw new Error("Could not verify current stock. Try again.");
      if (latest.stock.version !== options.stock.version && !request.current) { setConfirmOpen(false); throw new Error("Site stock changed. Review the updated batch allocation before confirming."); }
      const token = await csrfToken();
      const attachmentIds = photo ? [await attachPhoto(photo, token)] : [];
      const body = JSON.stringify({ siteId, materialId, quantity: quantity.trim(), wastedAt: new Date(wastedAt).toISOString(), reason, activity: activity.trim() || null, notes: notes.trim() || null, allocationMethod: method, attachmentIds, ...(method === "MANUAL" ? { batchAllocations: preview.map((entry) => ({ batchId: entry.id, quantity: entry.quantity })), overrideReason: overrideReason.trim() } : {}) });
      if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
      const response = await fetch("/api/v1/wastages", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { data?: WastageMutationResult; error?: { code?: string; message: string } };
      if (!response.ok || !result.data) {
        if (["INSUFFICIENT_STOCK", "INVENTORY_VERSION_CONFLICT", "WASTAGE_CONFLICT"].includes(result.error?.code ?? "")) { setConfirmOpen(false); void load(siteId, materialId); }
        if (result.error?.code === "FILE_NOT_READY") { pendingPhoto.current = null; request.current = null; }
        throw new Error(result.error?.message ?? "Could not record wastage.");
      }
      request.current = null;
      router.push(`/wastages/${result.data.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record wastage."); setPending(false); }
  }

  return <form className="space-y-5" onSubmit={review}>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_340px]"><div className="space-y-5">
      <section className="cs-panel p-6"><h2 className="text-lg font-extrabold">Site and material</h2><p className="cs-muted mt-1 text-sm">Record wastage against stock still held at the selected site.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Construction site *<select className="cs-input" onChange={(event) => chooseSite(event.target.value)} required value={siteId}><option value="">Select site</option>{options.sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label><label className="cs-field">Material *<select className="cs-input" disabled={!siteId || loading} onChange={(event) => chooseMaterial(event.target.value)} required value={materialId}><option value="">Select material</option>{options.materials.map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></label></div>{material && <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["On hand", options.stock?.onHand ?? "0"], ["Reserved", options.stock?.reserved ?? "0"], ["Available to write off", options.stock?.available ?? "0"]].map(([label, value]) => <div className="rounded bg-[#f6f2f7] p-4" key={label}><p className="cs-eyebrow">{label}</p><p className="mt-2 text-xl font-extrabold">{value} <span className="text-xs">{material.unit}</span></p></div>)}</div>}</section>
      <section className="cs-panel p-6"><h2 className="text-lg font-extrabold">Wastage details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Quantity lost {material ? `(${material.unit})` : ""} *<input className="cs-input" inputMode="decimal" maxLength={20} onChange={(event) => { setQuantity(event.target.value); setError(""); }} required value={quantity} /></label><label className="cs-field">Date and time *<input className="cs-input" onChange={(event) => setWastedAt(event.target.value)} required type="datetime-local" value={wastedAt} /></label><label className="cs-field">Reason *<select className="cs-input" onChange={(event) => setReason(event.target.value as WastageReason)} value={reason}>{wastageReasons.map((entry) => <option key={entry} value={entry}>{wastageReasonLabels[entry]}</option>)}</select></label><label className="cs-field">Activity or work area<input className="cs-input" maxLength={120} onChange={(event) => setActivity(event.target.value)} placeholder="Optional" value={activity} /></label><label className="cs-field sm:col-span-2">Notes<textarea className="cs-input" maxLength={2000} onChange={(event) => setNotes(event.target.value)} rows={3} value={notes} /></label><label className="cs-field sm:col-span-2">Supporting photo (optional)<input accept="image/jpeg,image/png,image/webp" className="cs-input" key={siteId} onChange={(event) => { setPhoto(event.target.files?.[0] ?? null); pendingPhoto.current = null; request.current = null; }} type="file" /><span className="cs-muted text-xs">JPEG, PNG, or WebP, up to 10 MB. Photos are private and uploaded when you confirm.</span></label></div>{overStock && <p className="mt-4 rounded bg-red-50 p-4 text-sm text-red-700">Quantity exceeds available stock. Reserved stock cannot be written off.</p>}</section>
      <section className="cs-panel overflow-hidden"><div className="flex flex-wrap justify-between gap-3 p-5"><div><h2 className="text-lg font-extrabold">Batch allocation preview</h2><p className="cs-muted mt-1 text-xs">Oldest eligible stock is used first; the server verifies batches on confirmation.</p></div><span className="cs-badge">{method === "FIFO" ? "Automatic FIFO" : "Manual allocation"}</span></div>{canManual && <div className="flex gap-2 border-t border-[#f0edf1] px-5 py-3"><button aria-pressed={method === "FIFO"} className={method === "FIFO" ? "cs-primary" : "cs-secondary"} onClick={() => setMethod("FIFO")} type="button">Automatic FIFO</button><button aria-pressed={method === "MANUAL"} className={method === "MANUAL" ? "cs-primary" : "cs-secondary"} onClick={() => setMethod("MANUAL")} type="button">Select batches</button></div>}{method === "MANUAL" && <label className="cs-field border-t border-[#f0edf1] px-5 py-4">Reason for manual selection *<textarea className="cs-input" maxLength={500} minLength={8} onChange={(event) => setOverrideReason(event.target.value)} value={overrideReason} /></label>}<div className="overflow-x-auto"><table className="cs-data-table min-w-[640px]"><thead><tr><th>Batch</th><th>Available</th><th>Quantity lost</th><th>Unit cost</th><th>Estimated loss</th></tr></thead><tbody>{options.batches.map((batch) => { const row = preview.find((entry) => entry.id === batch.id); return <tr key={batch.id}><td className="font-mono font-bold">{batch.batchCode}</td><td>{batch.available} {material?.unit}</td><td>{method === "MANUAL" ? <input aria-label={`Quantity from ${batch.batchCode}`} className="cs-input max-w-28" inputMode="decimal" onChange={(event) => setManualQuantities((current) => ({ ...current, [batch.id]: event.target.value }))} value={manualQuantities[batch.id] ?? ""} /> : `${row?.quantity ?? "0"} ${material?.unit ?? ""}`}</td><td>{currencyCode} {batch.unitCost}</td><td>{currencyCode} {row?.value ?? "0.00"}</td></tr>; })}</tbody></table>{!options.batches.length && <p className="cs-muted p-8 text-center text-sm">Choose a site and material with available batches.</p>}</div></section>
    </div><aside className="space-y-5"><section className="cs-panel p-6"><h2 className="text-xl font-extrabold">Loss summary</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-2"><dt>Site</dt><dd className="text-right font-bold">{site?.name ?? "Choose site"}</dd></div><div className="flex justify-between gap-2"><dt>Material</dt><dd className="text-right font-bold">{material?.name ?? "Choose material"}</dd></div><div className="flex justify-between"><dt>Lost quantity</dt><dd className="font-bold">{quantity || "0"} {material?.unit}</dd></div><div className="flex justify-between"><dt>Available after</dt><dd className="font-bold">{after.gte(0) ? after.toString() : "—"} {material?.unit}</dd></div></dl><div className="mt-6 rounded bg-[#144227] p-5 text-white"><p className="text-xs">Estimated stock value lost</p><p className="mt-2 text-2xl font-extrabold">{currencyCode} {previewValue.toFixed(2)}</p></div></section><section className="cs-panel p-6"><h2 className="cs-eyebrow">Stock integrity</h2><p className="cs-muted mt-3 text-xs leading-5">Confirmation writes the wastage, batch movements, stock balance, audit entry, and retry key in one transaction. Corrections use reversal.</p><button className="mt-4 text-xs font-bold text-[#144227] underline disabled:opacity-50" disabled={!siteId || !materialId || loading} onClick={() => void load(siteId, materialId)} type="button">Refresh current stock</button></section></aside></div>
    {error && !confirmOpen && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap justify-end gap-3 p-4"><Link className="cs-secondary" href="/wastages">Back to register</Link><button className="cs-primary disabled:opacity-50" disabled={pending || loading || overStock || !options.stock} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />Review wastage</button></div>
    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div aria-modal="true" aria-labelledby="wastage-confirm-title" className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <h2 className="text-xl font-extrabold" id="wastage-confirm-title">Confirm material wastage</h2>
        <p className="cs-muted mt-2 text-sm">This will remove {quantity} {material?.unit} of {material?.name} from {site?.name} and record {wastageReasonLabels[reason].toLowerCase()}.</p>
        <div className="mt-5 rounded bg-[#f6f2f7] p-5 text-sm">
          <p>Available stock: <strong>{options.stock?.available} → {after.toString()} {material?.unit}</strong></p>
          <p className="mt-2">Estimated loss: <strong>{currencyCode} {previewValue.toFixed(2)}</strong></p>
          <p className="mt-2">Photo: <strong>{photo?.name ?? "None"}</strong></p>
        </div>
        <p className="cs-muted mt-3 text-xs">The server recalculates FIFO allocation and checks stock before posting.</p>
        {error && <p aria-live="assertive" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="cs-secondary" disabled={pending} onClick={() => setConfirmOpen(false)} type="button">Back to edit</button>
          <button className="cs-primary disabled:opacity-50" disabled={pending} onClick={() => void confirm()} type="button">{pending ? "Recording…" : "Confirm and deduct stock"}</button>
        </div>
      </div>
    </div>}
  </form>;
}

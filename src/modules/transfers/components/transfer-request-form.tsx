"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { LoadingRing } from "@/components/feedback/loading-ring";
import { transferReasonLabels, transferReasons, type CreateTransferInput } from "../schemas/transfer";
import type { TransferOptions } from "../types";

const D = Decimal.clone({ precision: 80 });
const quantityPattern = /^\d{1,16}(?:\.\d{1,3})?$/;

export function TransferRequestForm({ initialOptions }: { initialOptions: TransferOptions }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const sequence = useRef(0);
  const [options, setOptions] = useState(initialOptions);
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [destinationSiteId, setDestinationSiteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [reason, setReason] = useState<typeof transferReasons[number]>("SITE_SHORTAGE");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const material = options.materials.find((entry) => entry.id === materialId);
  const source = options.sourceSites.find((entry) => entry.id === sourceSiteId);
  const destination = options.destinationSites.find((entry) => entry.id === destinationSiteId);
  const validQuantity = quantityPattern.test(quantity) && new D(quantity).gt(0) && (material?.unit !== "BAG" && material?.unit !== "PIECE" || new D(quantity).isInteger());
  const headroom = validQuantity ? new D(options.stock?.available ?? 0).minus(quantity) : null;

  async function load(siteId: string, nextMaterialId = "") {
    const current = ++sequence.current;
    setLoading(true); setError("");
    const params = new URLSearchParams({ sourceSiteId: siteId });
    if (nextMaterialId) params.set("materialId", nextMaterialId);
    try {
      const response = await fetch(`/api/v1/transfers/options?${params}`, { cache: "no-store" });
      const result = await response.json() as { data?: TransferOptions; error?: { message: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not load source stock.");
      if (current === sequence.current) setOptions(result.data);
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load source stock."); }
    finally { if (current === sequence.current) setLoading(false); }
  }

  function chooseSource(value: string) {
    sequence.current++; setSourceSiteId(value); setDestinationSiteId(""); setMaterialId(""); setQuantity(""); setReview(false); request.current = null;
    setOptions({ ...initialOptions, materials: [], stock: null, batches: [] });
    if (value) void load(value);
  }
  function chooseMaterial(value: string) {
    sequence.current++; setMaterialId(value); setQuantity(""); setReview(false); request.current = null;
    setOptions((current) => ({ ...current, stock: null, batches: [] }));
    if (value) void load(sourceSiteId, value);
  }
  function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || !destination || !material || source.id === destination.id) return setError("Choose two different active sites and a material.");
    if (!validQuantity) return setError(`Enter a positive quantity matching ${material.unit} precision.`);
    if (!purpose.trim() || purpose.trim().length < 3) return setError("Describe the transfer purpose.");
    setError(""); setReview(true);
  }
  async function submit() {
    if (!source || !destination || !material) return;
    const input: CreateTransferInput = { sourceSiteId, destinationSiteId, materialId, quantity: new D(quantity).toString(), reason, purpose: purpose.trim(), notes: notes.trim() || null, ...(targetDate ? { targetDate } : {}) };
    const body = JSON.stringify(input);
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch("/api/v1/transfers", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { data?: { id: string }; error?: { message: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not request transfer.");
      request.current = null;
      router.push(`/transfers/${result.data.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request transfer."); }
    finally { setPending(false); }
  }

  return <div className="grid items-start gap-5 xl:grid-cols-[1.55fr_.75fr]">
    <form className="space-y-5" onSubmit={onReview}>
      <section className="cs-panel p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">1. Route &amp; schedule</h2><span className="cs-badge cs-badge-quiet">Source → destination</span></div><p className="cs-muted mt-1 text-sm">Select two active sites in this organization.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Source site *<select className="cs-input" onChange={(event) => chooseSource(event.target.value)} required value={sourceSiteId}><option value="">Choose source site</option>{options.sourceSites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.code}</option>)}</select></label><label className="cs-field">Destination site *<select className="cs-input" onChange={(event) => { setDestinationSiteId(event.target.value); setReview(false); }} required value={destinationSiteId}><option value="">Choose destination site</option>{options.destinationSites.filter((site) => site.id !== sourceSiteId).map((site) => <option key={site.id} value={site.id}>{site.name} · {site.code}</option>)}</select></label><label className="cs-field">Target transfer date<input className="cs-input" onChange={(event) => { setTargetDate(event.target.value); setReview(false); }} type="date" value={targetDate} /></label></div></section>
      <section className="cs-panel p-6"><h2 className="text-lg font-extrabold">2. Material &amp; source stock</h2><p className="cs-muted mt-1 text-sm">The request does not reserve stock. FIFO batches are selected when an approver confirms it.</p><label className="cs-field mt-5">Material *<select className="cs-input" disabled={!sourceSiteId || loading} onChange={(event) => chooseMaterial(event.target.value)} required value={materialId}><option value="">Choose material</option>{options.materials.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code} ({item.unit})</option>)}</select></label>{loading && <p aria-live="polite" className="cs-muted mt-3 flex items-center gap-2 text-xs" role="status"><LoadingRing small /> Loading source stock…</p>}{material && options.stock && <div className="mt-5 grid gap-3 rounded-lg bg-[#f6f2f7] p-4 sm:grid-cols-3"><div><p className="cs-eyebrow">On hand</p><strong className="mt-2 block text-xl">{options.stock.onHand} {material.unit}</strong></div><div><p className="cs-eyebrow">Reserved</p><strong className="mt-2 block text-xl">{options.stock.reserved} {material.unit}</strong></div><div><p className="cs-eyebrow">Available now</p><strong className="mt-2 block text-xl text-[#144227]">{options.stock.available} {material.unit}</strong></div></div>}{material && !options.stock && !loading && <p className="cs-muted mt-3 text-sm">No stock balance at this source site yet. The request can be submitted, but approval will require available stock.</p>}</section>
      <section className="cs-panel p-6"><h2 className="text-lg font-extrabold">3. Quantity &amp; guardrails</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Requested quantity *<div className="flex items-center gap-2"><input className="cs-input" min="0" onChange={(event) => { setQuantity(event.target.value); setReview(false); }} placeholder="0" required step={material?.unit === "BAG" || material?.unit === "PIECE" ? "1" : "0.001"} type="number" value={quantity} /><span className="cs-badge cs-badge-quiet">{material?.unit ?? "UNIT"}</span></div></label>{headroom && <div className="rounded-lg bg-[#f6f2f7] p-4"><p className="cs-eyebrow">Available after approval</p><strong className={`mt-2 block text-xl ${headroom.lt(0) ? "text-red-700" : "text-[#144227]"}`}>{headroom.toString()} {material?.unit}</strong><p className="cs-muted mt-1 text-xs">Snapshot only; checked again at approval.</p></div>}</div><p className="cs-muted mt-4 text-xs">BAG and PIECE use whole numbers. Other units allow up to three decimals. Negative stock is blocked.</p></section>
      <section className="cs-panel p-6"><h2 className="text-lg font-extrabold">4. Transfer purpose</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Reason *<select className="cs-input" onChange={(event) => { setReason(event.target.value as typeof reason); setReview(false); }} value={reason}>{transferReasons.map((item) => <option key={item} value={item}>{transferReasonLabels[item]}</option>)}</select></label><label className="cs-field sm:col-span-2">Activity or purpose *<input className="cs-input" maxLength={500} minLength={3} onChange={(event) => { setPurpose(event.target.value); setReview(false); }} placeholder="Where and why is this material needed?" required value={purpose} /></label><label className="cs-field sm:col-span-2">Handling notes<textarea className="cs-input" maxLength={2000} onChange={(event) => { setNotes(event.target.value); setReview(false); }} placeholder="Optional handover or handling instructions" rows={3} value={notes} /></label></div></section>
      <button className="cs-secondary" type="submit">Review request <WorkspaceIcon className="h-4 w-4" name="arrow" /></button>
    </form>
    <aside className="space-y-4 xl:sticky xl:top-5"><section className="cs-panel p-6"><h2 className="text-lg font-extrabold">Request summary</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="cs-eyebrow">From</dt><dd className="mt-1 font-semibold">{source?.name ?? "Choose a source"}</dd></div><div><dt className="cs-eyebrow">To</dt><dd className="mt-1 font-semibold">{destination?.name ?? "Choose a destination"}</dd></div><div><dt className="cs-eyebrow">Material</dt><dd className="mt-1 font-semibold">{material?.name ?? "Choose a material"}</dd></div><div><dt className="cs-eyebrow">Requested</dt><dd className="mt-1 text-xl font-extrabold">{quantity || "—"} {material?.unit ?? ""}</dd></div><div><dt className="cs-eyebrow">Approval state</dt><dd className="mt-1">Stock is reserved only after approval.</dd></div></dl>{review && <div className="mt-5 rounded-lg border border-[#c6dbca] bg-[#eff8f0] p-4 text-sm"><strong>Ready to request</strong><p className="mt-1">Review the route, quantity, and purpose. Approval will check live source stock.</p></div>}{error && <p aria-live="polite" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button className="cs-primary mt-5 w-full justify-center disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={!review || pending} onClick={submit} type="button">{pending ? "Submitting…" : "Submit transfer request"}</button><Link className="cs-muted mt-4 block text-center text-sm underline" href="/transfers">Cancel and return to transfers</Link></section><section className="cs-panel flex gap-3 p-5 text-xs"><WorkspaceIcon className="h-5 w-5 shrink-0 text-[#144227]" name="shield" /><p>Approval reserves FIFO stock. Dispatch removes it from source on-hand. Receipt adds linked batches at the destination.</p></section></aside>
  </div>;
}

"use client";

import { upload } from "@vercel/blob/client";
import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { maxReceiptDocumentBytes } from "@/modules/files/schemas/file-attachment";
import type { PurchaseOrderView } from "@/modules/purchasing/types";
import type { ReceiptMutationResult } from "../types";

const D = Decimal.clone({ precision: 80 });
type Row = { key: string; purchaseOrderItemId: string; materialId: string; quantityReceived: string; supplierBatchNumber: string; unitCost: string };
type DocumentPurpose = "INVOICE" | "DELIVERY_CHALLAN";
type PendingDocument = { file: File; id: string; fileKey: string; uploaded: boolean; ready: boolean };
const quantityPattern = /^\d{1,16}(?:\.\d{1,3})?$/;
const moneyPattern = /^\d{1,16}(?:\.\d{1,2})?$/;

export function GoodsReceiptForm({ order, currencyCode }: { order: PurchaseOrderView; currencyCode: string }) {
  const router = useRouter();
  const request = useRef<{ body: string; key: string } | null>(null);
  const pendingDocuments = useRef<Partial<Record<DocumentPurpose, PendingDocument>>>({});
  const [receivedAt, setReceivedAt] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryChallanNumber, setDeliveryChallanNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [challanFile, setChallanFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>(() => order.items.filter((line) => new D(line.remainingQuantity).gt(0)).map((line) => ({ key: line.id, purchaseOrderItemId: line.id, materialId: line.material.id, quantityReceived: "", supplierBatchNumber: "", unitCost: line.unitPrice })));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selected = rows.filter((row) => row.quantityReceived.trim() !== "");
  let netTotal = new D(0);
  for (const row of selected) {
    if (quantityPattern.test(row.quantityReceived) && moneyPattern.test(row.unitCost)) netTotal = netTotal.plus(new D(row.quantityReceived).times(row.unitCost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  function change(key: string, field: keyof Omit<Row, "key" | "purchaseOrderItemId" | "materialId">, value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
    setError("");
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivedAt || Number.isNaN(new Date(receivedAt).getTime())) { setError("Choose a valid delivery date and time."); return; }
    if (!selected.length) { setError("Enter a quantity for at least one material batch."); return; }
    for (const row of selected) {
      const line = order.items.find((item) => item.id === row.purchaseOrderItemId)!;
      if (!quantityPattern.test(row.quantityReceived) || !new D(row.quantityReceived).gt(0) || ((line.material.unit === "BAG" || line.material.unit === "PIECE") && !new D(row.quantityReceived).isInteger())) { setError(`Check the quantity for ${line.material.name}.`); return; }
      if (!moneyPattern.test(row.unitCost)) { setError(`Check the unit cost for ${line.material.name}.`); return; }
    }
    for (const line of order.items) {
      const total = selected.filter((row) => row.purchaseOrderItemId === line.id).reduce((sum, row) => sum.plus(row.quantityReceived), new D(0));
      if (total.gt(line.remainingQuantity)) { setError(`This delivery exceeds the ${line.material.name} quantity remaining on the PO.`); return; }
    }
    for (const file of [invoiceFile, challanFile]) {
      if (file && (file.size < 1 || file.size > maxReceiptDocumentBytes || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError("Choose a PDF, JPEG, PNG, or WebP document up to 15 MB."); return; }
    }
    setError("");
    setConfirmOpen(true);
  }

  async function prepareDocument(file: File, purpose: DocumentPurpose, token: string): Promise<string> {
    let item = pendingDocuments.current[purpose];
    if (!item || item.file !== file) {
      const response = await fetch("/api/v1/files", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ siteId: order.site.id, purpose, fileName: file.name, mimeType: file.type, size: file.size }) });
      const body = await response.json() as { data?: { id: string; fileKey: string }; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not prepare the document upload.");
      item = { file, id: body.data.id, fileKey: body.data.fileKey, uploaded: false, ready: false };
      pendingDocuments.current[purpose] = item;
    }
    async function finalize() {
      const response = await fetch(`/api/v1/files/${item!.id}/finalize`, { method: "POST", headers: { "X-CSRF-Token": token } });
      const body = await response.json() as { data?: { uploadState: string }; error?: { message: string } };
      if (response.ok && body.data?.uploadState === "READY") { item!.ready = true; return true; }
      if (body.error?.message && response.status !== 409) throw new Error(body.error.message);
      return false;
    }
    if (!item.uploaded && !await finalize()) {
      await upload(item.fileKey, file, { access: "private", handleUploadUrl: "/api/v1/files/upload", clientPayload: JSON.stringify({ attachmentId: item.id }), headers: { "X-CSRF-Token": token } });
      item.uploaded = true;
    }
    if (!item.ready && !await finalize()) throw new Error("Document upload is not complete. Retry to continue.");
    return item.id;
  }

  async function confirm() {
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const attachmentIds: string[] = [];
      if (invoiceFile) attachmentIds.push(await prepareDocument(invoiceFile, "INVOICE", csrf.data.token));
      if (challanFile) attachmentIds.push(await prepareDocument(challanFile, "DELIVERY_CHALLAN", csrf.data.token));
      const body = JSON.stringify({ purchaseOrderId: order.id, receivedAt: new Date(receivedAt).toISOString(), invoiceNumber: invoiceNumber.trim() || null, deliveryChallanNumber: deliveryChallanNumber.trim() || null, notes: notes.trim() || null, attachmentIds, items: selected.map((row) => ({ purchaseOrderItemId: row.purchaseOrderItemId, materialId: row.materialId, quantityReceived: row.quantityReceived.trim(), supplierBatchNumber: row.supplierBatchNumber.trim() || null, unitCost: row.unitCost.trim() })) });
      if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
      const response = await fetch("/api/v1/goods-receipts", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token, "Idempotency-Key": request.current.key }, body });
      const result = await response.json() as { data?: ReceiptMutationResult; error?: { message: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not confirm this delivery.");
      request.current = null;
      router.push(`/goods-receipts/${result.data.id}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm this delivery."); setPending(false); setConfirmOpen(false); }
  }

  return <form className="space-y-6" onSubmit={review}>
    <section className="cs-panel grid gap-4 p-5 sm:grid-cols-3"><div><p className="cs-eyebrow">Purchase order</p><p className="mt-2 font-mono text-lg font-bold text-[#144227]">{order.poNumber}</p><p className="cs-muted mt-1 text-xs">{order.status.replaceAll("_", " ")}</p></div><div><p className="cs-eyebrow">Receiving site</p><p className="mt-2 text-lg font-bold">{order.site.name}</p><p className="cs-muted mt-1 text-xs">{order.site.code}</p></div><div><p className="cs-eyebrow">Supplier</p><p className="mt-2 text-lg font-bold">{order.supplier.name}</p><p className="cs-muted mt-1 text-xs">{order.supplier.code}</p></div></section>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_340px]"><div className="space-y-5"><section className="cs-panel p-5 sm:p-6"><h2 className="text-lg font-extrabold">Delivery reference</h2><p className="cs-muted mt-1 text-xs">Record the physical arrival and supplier documents.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="cs-field">Delivery date &amp; time *<input className="cs-input" onChange={(event) => setReceivedAt(event.target.value)} required type="datetime-local" value={receivedAt} /></label><label className="cs-field">Delivery challan / reference<input className="cs-input" maxLength={100} onChange={(event) => setDeliveryChallanNumber(event.target.value)} placeholder="DC-100" value={deliveryChallanNumber} /></label><label className="cs-field">Supplier invoice number<input className="cs-input" maxLength={100} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="INV-100" value={invoiceNumber} /></label><label className="cs-field sm:col-span-2">Receiving remarks<textarea className="cs-input" maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Condition, delivery notes, or discrepancies" rows={3} value={notes} /></label><label className="cs-field">Invoice file (optional)<input accept="application/pdf,image/jpeg,image/png,image/webp" className="cs-input" onChange={(event) => { setInvoiceFile(event.target.files?.[0] ?? null); pendingDocuments.current.INVOICE = undefined; request.current = null; }} type="file" /></label><label className="cs-field">Delivery challan file (optional)<input accept="application/pdf,image/jpeg,image/png,image/webp" className="cs-input" onChange={(event) => { setChallanFile(event.target.files?.[0] ?? null); pendingDocuments.current.DELIVERY_CHALLAN = undefined; request.current = null; }} type="file" /></label><p className="cs-muted text-xs sm:col-span-2">Private PDF or image, up to 15 MB each. Files upload when you confirm the receipt.</p></div></section>
      <section className="cs-panel p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Physical material intake</h2><p className="cs-muted mt-1 text-xs">Leave a quantity blank for a material that did not arrive. Add another batch when the same material arrived in separate lots.</p></div><span className="cs-badge">{selected.length} {selected.length === 1 ? "batch" : "batches"} selected</span></div><div className="mt-5 space-y-4">{order.items.filter((line) => new D(line.remainingQuantity).gt(0)).map((line) => <div className="rounded-lg bg-[#f6f2f7] p-4" key={line.id}><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{line.material.name}</strong><p className="cs-muted font-mono text-[11px]">{line.material.code} · {line.material.unit}</p></div><span className="text-xs font-bold text-[#144227]">{line.remainingQuantity} {line.material.unit} remaining</span></div><p className="cs-muted mt-3 text-xs">Ordered {line.quantityOrdered} · Previously received {line.quantityReceived}</p>{rows.filter((row) => row.purchaseOrderItemId === line.id).map((row, index) => <div className="mt-3 grid gap-3 border-t border-[#dcd9dd] pt-3 sm:grid-cols-3" key={row.key}><label className="cs-field">Quantity now ({line.material.unit})<input className="cs-input" inputMode="decimal" maxLength={20} onChange={(event) => change(row.key, "quantityReceived", event.target.value)} placeholder="0" value={row.quantityReceived} /></label><label className="cs-field">Supplier batch number<input className="cs-input" maxLength={100} onChange={(event) => change(row.key, "supplierBatchNumber", event.target.value)} placeholder="Optional" value={row.supplierBatchNumber} /></label><label className="cs-field">Actual unit cost ({currencyCode})<input className="cs-input" inputMode="decimal" maxLength={20} onChange={(event) => change(row.key, "unitCost", event.target.value)} value={row.unitCost} /></label>{index > 0 && <button className="cs-muted justify-self-start text-xs font-semibold underline" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} type="button">Remove batch</button>}</div>)}<button className="mt-3 text-xs font-bold text-[#144227] underline disabled:opacity-50" disabled={rows.length >= 30} onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), purchaseOrderItemId: line.id, materialId: line.material.id, quantityReceived: "", supplierBatchNumber: "", unitCost: line.unitPrice }])} type="button">+ Add another batch</button></div>)}</div></section></div>
      <aside className="space-y-5"><section className="cs-panel p-6"><h2 className="text-xl font-extrabold">Inward summary</h2><p className="cs-muted mt-1 text-xs">Actual batch cost, excluding PO tax</p><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt>Material batches</dt><dd className="font-bold">{selected.length}</dd></div><div className="flex justify-between"><dt>Receiving site</dt><dd className="font-bold">{order.site.code}</dd></div></dl><div className="mt-6 rounded-lg bg-[#144227] p-5 text-white"><p className="text-xs font-semibold text-[#bceec8]">Net stock value to add</p><p className="mt-2 text-2xl font-extrabold">{currencyCode} {netTotal.toFixed(2)}</p></div></section><section className="cs-panel p-6"><h2 className="cs-eyebrow">Receiving rules</h2><ul className="mt-4 space-y-3 text-xs text-[#414942]"><li>✓ Quantities may not exceed the PO remainder.</li><li>✓ BAG and PIECE quantities are whole numbers.</li><li>✓ Measured quantities allow three decimals.</li><li>✓ Confirmation creates batches, balances, ledger entries, and audit history together.</li></ul></section></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap justify-end gap-3 p-4"><Link className="cs-secondary" href={`/purchase-orders/${order.id}`}>Back to purchase order</Link><button className="cs-primary disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={pending} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />Review delivery</button></div>
    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><div aria-modal="true" className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" role="dialog"><h2 className="text-xl font-extrabold">Confirm Inward Goods Receipt</h2><p className="cs-muted mt-2 text-sm">Please review the physical quantities. Confirmation immediately updates inventory.</p><div className="mt-5 grid gap-3 rounded bg-[#f6f2f7] p-4 text-sm sm:grid-cols-3"><div><span className="cs-eyebrow">PO</span><p className="mt-1 font-bold">{order.poNumber}</p></div><div><span className="cs-eyebrow">Site</span><p className="mt-1 font-bold">{order.site.name}</p></div><div><span className="cs-eyebrow">Supplier</span><p className="mt-1 font-bold">{order.supplier.name}</p></div></div><ul className="mt-5 max-h-48 space-y-2 overflow-y-auto">{selected.map((row) => { const line = order.items.find((item) => item.id === row.purchaseOrderItemId)!; return <li className="flex justify-between gap-3 rounded bg-[#f6f2f7] p-3 text-sm" key={row.key}><span>{line.material.name}{row.supplierBatchNumber ? ` · ${row.supplierBatchNumber}` : ""}</span><strong>+{row.quantityReceived} {line.material.unit}</strong></li>; })}</ul><p className="mt-5 rounded bg-[#e8f0eb] p-4 text-right font-bold text-[#144227]">Net stock value: {currencyCode} {netTotal.toFixed(2)}</p><p className="cs-muted mt-3 text-xs">Safe retry uses the same idempotency key if the connection drops.</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button className="cs-secondary" disabled={pending} onClick={() => setConfirmOpen(false)} type="button">Back to edit</button><button className="cs-primary disabled:opacity-50" aria-busy={pending} data-loading={pending} disabled={pending} onClick={() => void confirm()} type="button">{pending ? "Updating inventory…" : "Confirm & post to inventory"}</button></div></div></div>}
  </form>;
}

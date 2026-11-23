"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import { materialUnits, type CategoryView, type MaterialView } from "../types";

type ApiResult = { data?: MaterialView; error?: { message: string; details?: { fields?: Record<string, string[]> } } };

export function MaterialForm({ material, categories }: { material?: MaterialView; categories: CategoryView[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const input = {
      code: material?.code ?? field("code"), name: field("name"), description: field("description"),
      categoryId: field("categoryId"), unit: material?.unitLocked ? material.unit : field("unit"),
      minimumStockLevel: field("minimumStockLevel"), defaultReorderQuantity: field("defaultReorderQuantity") || null,
    };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(material ? "/api/v1/materials/" + material.id : "/api/v1/materials", {
        method: material ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token },
        body: JSON.stringify(input),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) {
        const fields = result.error?.details?.fields;
        const first = fields && Object.entries(fields).find(([, messages]) => messages?.length);
        throw new Error(first ? first[0] + ": " + first[1][0] : result.error?.message ?? "Could not save the material.");
      }
      router.push("/materials/" + result.data.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the material.");
      setPending(false);
    }
  }

  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_.7fr]"><div className="space-y-5">
      <section className="cs-panel cs-form-section p-6"><div><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">01</span>Core material identification</h2><p className="cs-muted mt-1 text-xs">Company-wide code and classification.</p></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Material code *<input className="cs-input disabled:text-[#58605c]" defaultValue={material?.code} disabled={Boolean(material)} maxLength={30} minLength={2} name="code" placeholder="MAT-CEM-01" required={!material} />{material && <span className="cs-muted mt-1 block text-[11px]">Code is fixed in this editor.</span>}</label><label className="cs-field">Material name *<input className="cs-input" defaultValue={material?.name} maxLength={120} minLength={2} name="name" placeholder="OPC 53 Grade Cement" required /></label><label className="cs-field sm:col-span-2">Category *<select className="cs-input" defaultValue={material?.category.id ?? categories[0]?.id} name="categoryId" required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="cs-field sm:col-span-2">Technical description<textarea className="cs-input" defaultValue={material?.description ?? ""} maxLength={1000} name="description" placeholder="Material grade, specification, or handling notes" rows={4} /></label></div></section>
      <section className="cs-panel cs-form-section p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">02</span>Measurement &amp; unit specification</h2><p className="cs-muted mt-1 text-xs">Set the quantity precision used by inventory operations.</p><div className="mt-6 grid gap-4 sm:grid-cols-[1fr_.9fr]"><label className="cs-field">Unit of measure *<select className="cs-input" defaultValue={material?.unit ?? "BAG"} disabled={material?.unitLocked} name="unit">{materialUnits.map((unit) => <option key={unit} value={unit}>{unit.replaceAll("_", " ")}</option>)}</select></label><div className="rounded bg-[#f6f2f7] p-4 text-xs leading-5 text-[#414942]"><p className="font-bold text-[#144227]">Unit precision rule</p><p>BAG and PIECE use whole numbers. Other units allow up to three decimal places.</p></div></div>{material?.unitLocked && <p className="mt-4 flex items-center gap-2 rounded bg-[#d7dfda] p-3 text-xs font-semibold text-[#144227]"><WorkspaceIcon className="h-4 w-4" name="shield" />Unit is locked after the first inventory transaction.</p>}</section>
      <section className="cs-panel cs-form-section p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">03</span>Buffer &amp; reorder parameters</h2><p className="cs-muted mt-1 text-xs">Baseline values for future stock alerts and purchasing.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Minimum stock level *<input className="cs-input" defaultValue={material?.minimumStockLevel ?? "0"} inputMode="decimal" name="minimumStockLevel" required /></label><label className="cs-field">Default reorder quantity<input className="cs-input" defaultValue={material?.defaultReorderQuantity ?? ""} inputMode="decimal" name="defaultReorderQuantity" placeholder="Optional" /></label></div><p className="cs-muted mt-3 text-xs">Minimum can be zero; a reorder quantity must be greater than zero.</p></section>
    </div><aside className="space-y-5"><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="materials" />Catalogue scope</h2><p className="cs-muted mt-3 text-xs leading-5">Approved materials are available to all sites in this company. This record defines specifications and thresholds; it does not represent live stock.</p></section><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Catalogue requirements</h2><ul className="mt-4 list-disc space-y-3 pl-4 text-xs text-[#414942]"><li>Unique material code and descriptive name</li><li>Active material category</li><li>Quantity matches the selected unit</li><li>Reorder quantity, if supplied, is positive</li></ul></section><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Catalogue governance</h2><p className="cs-muted mt-3 text-xs leading-5">Changes are audited. Archiving may be blocked by stock or open workflows.</p><Link className="mt-4 inline-block text-xs font-bold text-[#144227] underline" href="/materials/categories">Manage categories</Link></section></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap items-center justify-end gap-3 p-4"><Link className="cs-secondary" href={material ? "/materials/" + material.id : "/materials"}>Cancel</Link><button className="cs-primary disabled:opacity-50" disabled={pending || categories.length === 0} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />{pending ? "Saving…" : material ? "Save changes" : "Save material"}</button></div>
  </form>;
}

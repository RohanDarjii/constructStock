"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { materialUnits, type CategoryView, type MaterialView } from "../types";

type ApiResult = { data?: MaterialView; error?: { message: string } };
const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100";

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
      code: field("code"), name: field("name"), description: field("description"), categoryId: field("categoryId"), unit: material?.unitLocked ? material.unit : field("unit"),
      minimumStockLevel: field("minimumStockLevel"), defaultReorderQuantity: field("defaultReorderQuantity") || null,
    };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(material ? `/api/v1/materials/${material.id}` : "/api/v1/materials", {
        method: material ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token },
        body: JSON.stringify(input),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not save the material.");
      router.push(`/materials/${result.data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the material.");
      setPending(false);
    }
  }

  return <form className="space-y-6" onSubmit={submit}>
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold">Material details</h2><div className="mt-5 grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-medium">Code<input className={inputClass} defaultValue={material?.code} maxLength={30} minLength={2} name="code" placeholder="CEM-OPC53" required /></label>
      <label className="text-sm font-medium">Name<input className={inputClass} defaultValue={material?.name} maxLength={120} minLength={2} name="name" required /></label>
      <label className="text-sm font-medium">Category<select className={inputClass} defaultValue={material?.category.id ?? categories[0]?.id} name="categoryId" required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="text-sm font-medium">Unit<select className={inputClass} defaultValue={material?.unit ?? "BAG"} disabled={material?.unitLocked} name="unit">{materialUnits.map((unit) => <option key={unit} value={unit}>{unit.replaceAll("_", " ")}</option>)}</select>{material?.unitLocked && <span className="mt-1 block text-xs text-slate-500">Unit is fixed after the first inventory transaction.</span>}</label>
      <label className="text-sm font-medium">Minimum stock level<input className={inputClass} defaultValue={material?.minimumStockLevel ?? "0"} inputMode="decimal" name="minimumStockLevel" required /></label>
      <label className="text-sm font-medium">Default reorder quantity (optional)<input className={inputClass} defaultValue={material?.defaultReorderQuantity ?? ""} inputMode="decimal" name="defaultReorderQuantity" /></label>
      <label className="text-sm font-medium sm:col-span-2">Description (optional)<textarea className={inputClass} defaultValue={material?.description ?? ""} maxLength={1000} name="description" rows={3} /></label>
    </div></section>
    {error && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex items-center gap-4"><button className="rounded-md bg-emerald-900 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={pending || categories.length === 0} type="submit">{pending ? "Saving…" : material ? "Save changes" : "Create material"}</button><Link className="text-sm text-slate-600 underline" href={material ? `/materials/${material.id}` : "/materials"}>Cancel</Link></div>
  </form>;
}

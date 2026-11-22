"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SiteView } from "../types";

type ApiResult = { success: boolean; data?: SiteView; error?: { message: string } };

export function SiteForm({ site, currencyCode }: { site?: SiteView; currencyCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const contact = { name: field("contactName"), phone: field("contactPhone"), email: field("contactEmail") };
    const input = {
      code: field("code"), name: field("name"), description: field("description"), status: field("status"),
      location: { address: field("address"), city: field("city"), state: field("state"), country: field("country") },
      contact: Object.values(contact).some(Boolean) ? contact : null,
      startDate: field("startDate") || null,
      expectedCompletionDate: field("expectedCompletionDate") || null,
      budget: field("budget") || null,
    };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(site ? `/api/v1/sites/${site.id}` : "/api/v1/sites", {
        method: site ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token },
        body: JSON.stringify(input),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not save the site.");
      router.push(`/sites/${result.data.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the site.");
      setPending(false);
    }
  }

  const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100";
  return <form className="space-y-7" onSubmit={submit}>
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Site details</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Site code<input className={inputClass} defaultValue={site?.code} maxLength={30} minLength={2} name="code" placeholder="SITE-001" required /></label>
        <label className="text-sm font-medium">Site name<input className={inputClass} defaultValue={site?.name} maxLength={120} minLength={2} name="name" required /></label>
        <label className="text-sm font-medium sm:col-span-2">Description (optional)<textarea className={inputClass} defaultValue={site?.description ?? ""} maxLength={1000} name="description" rows={3} /></label>
        <label className="text-sm font-medium">Status<select className={inputClass} defaultValue={site?.status ?? "PLANNED"} name="status"><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label className="text-sm font-medium">Budget (optional, {currencyCode})<input className={inputClass} defaultValue={site?.budget ?? ""} inputMode="decimal" name="budget" placeholder="25000000.00" /></label>
        <label className="text-sm font-medium">Start date (optional)<input className={inputClass} defaultValue={site?.startDate ?? ""} name="startDate" type="date" /></label>
        <label className="text-sm font-medium">Expected completion (optional)<input className={inputClass} defaultValue={site?.expectedCompletionDate ?? ""} name="expectedCompletionDate" type="date" /></label>
      </div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Location</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Address (optional)<input className={inputClass} defaultValue={site?.location.address ?? ""} maxLength={200} name="address" /></label>
        <label className="text-sm font-medium">City<input className={inputClass} defaultValue={site?.location.city} maxLength={100} name="city" required /></label>
        <label className="text-sm font-medium">State or region (optional)<input className={inputClass} defaultValue={site?.location.state ?? ""} maxLength={100} name="state" /></label>
        <label className="text-sm font-medium sm:col-span-2">Country<input className={inputClass} defaultValue={site?.location.country} maxLength={100} name="country" required /></label>
      </div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Site contact (optional)</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <label className="text-sm font-medium">Name<input className={inputClass} defaultValue={site?.contact?.name ?? ""} maxLength={120} name="contactName" /></label>
        <label className="text-sm font-medium">Phone<input className={inputClass} defaultValue={site?.contact?.phone ?? ""} maxLength={30} name="contactPhone" type="tel" /></label>
        <label className="text-sm font-medium">Email<input className={inputClass} defaultValue={site?.contact?.email ?? ""} maxLength={254} name="contactEmail" type="email" /></label>
      </div>
    </section>
    {error && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex items-center gap-4"><button className="rounded-md bg-emerald-900 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving…" : site ? "Save changes" : "Create site"}</button><Link className="text-sm text-slate-600 underline" href={site ? `/sites/${site.id}` : "/sites"}>Cancel</Link></div>
  </form>;
}

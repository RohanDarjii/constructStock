"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
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
      startDate: field("startDate") || null, expectedCompletionDate: field("expectedCompletionDate") || null,
      budget: field("budget") || null,
    };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(site ? "/api/v1/sites/" + site.id : "/api/v1/sites", {
        method: site ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token },
        body: JSON.stringify(input),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not save the site.");
      router.push("/sites/" + result.data.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the site.");
      setPending(false);
    }
  }

  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_.75fr]"><div className="space-y-5">
      <section className="cs-panel p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">01</span>Site identity</h2><p className="cs-muted mt-1 text-xs">Core project name, identifier, and lifecycle.</p></div><span className="cs-eyebrow">Required</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Unique site code *<input className="cs-input" defaultValue={site?.code} maxLength={30} minLength={2} name="code" placeholder="SITE-001" required /></label><label className="cs-field">Initial status *<select className="cs-input" defaultValue={site?.status ?? "PLANNED"} name="status"><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label><label className="cs-field sm:col-span-2">Site name *<input className="cs-input" defaultValue={site?.name} maxLength={120} minLength={2} name="name" placeholder="Skyline Residency" required /></label><label className="cs-field sm:col-span-2">Project description<textarea className="cs-input" defaultValue={site?.description ?? ""} maxLength={1000} name="description" placeholder="Describe the jobsite scope and construction activities" rows={4} /></label></div></section>
      <section className="cs-panel p-6"><div><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">02</span>Project dates &amp; fiscal scope</h2><p className="cs-muted mt-1 text-xs">Plan the schedule and optional budget.</p></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Project start date<input className="cs-input" defaultValue={site?.startDate ?? ""} name="startDate" type="date" /></label><label className="cs-field">Expected completion<input className="cs-input" defaultValue={site?.expectedCompletionDate ?? ""} name="expectedCompletionDate" type="date" /></label><label className="cs-field sm:col-span-2">Project budget ({currencyCode})<input className="cs-input" defaultValue={site?.budget ?? ""} inputMode="decimal" name="budget" placeholder="25000000.00" /></label></div><p className="cs-muted mt-3 text-xs">Budget values use the company currency and two decimal places.</p></section>
      <section className="cs-panel p-6"><div><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">03</span>Location &amp; delivery access</h2><p className="cs-muted mt-1 text-xs">The physical address used by site teams and suppliers.</p></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field sm:col-span-2">Street address<input className="cs-input" defaultValue={site?.location.address ?? ""} maxLength={200} name="address" placeholder="Plot 4, Institutional Area" /></label><label className="cs-field">City *<input className="cs-input" defaultValue={site?.location.city} maxLength={100} name="city" required /></label><label className="cs-field">State / region<input className="cs-input" defaultValue={site?.location.state ?? ""} maxLength={100} name="state" /></label><label className="cs-field sm:col-span-2">Country *<input className="cs-input" defaultValue={site?.location.country} maxLength={100} name="country" required /></label></div></section>
    </div><aside className="space-y-5"><section className="cs-panel p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">04</span>Primary site contact</h2><p className="cs-muted mt-1 text-xs">Optional contact for logistics and site coordination.</p><div className="mt-6 space-y-4"><label className="cs-field">Contact name<input className="cs-input" defaultValue={site?.contact?.name ?? ""} maxLength={120} name="contactName" /></label><label className="cs-field">Phone number<input className="cs-input" defaultValue={site?.contact?.phone ?? ""} maxLength={30} name="contactPhone" type="tel" /></label><label className="cs-field">Email<input className="cs-input" defaultValue={site?.contact?.email ?? ""} maxLength={254} name="contactEmail" type="email" /></label></div></section><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Access control</h2><p className="cs-muted mt-3 text-xs leading-5">Owners and admins manage sites. Site-scoped team members can view only sites assigned to them.</p></section></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap items-center justify-end gap-3 p-4"><Link className="cs-secondary" href={site ? "/sites/" + site.id : "/sites"}>Cancel</Link><button className="cs-primary disabled:opacity-50" disabled={pending} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />{pending ? "Saving…" : site ? "Save changes" : "Create site"}</button></div>
  </form>;
}

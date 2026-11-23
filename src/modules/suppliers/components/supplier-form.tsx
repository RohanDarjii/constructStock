"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
import type { SupplierView } from "../types";

type ApiResult = { data?: SupplierView; error?: { message: string; details?: { fields?: Record<string, string[]> } } };

export function SupplierForm({ supplier }: { supplier?: SupplierView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const address = { line1: field("line1"), city: field("city"), state: field("state"), postalCode: field("postalCode"), country: field("country") };
    const input = {
      ...(!supplier ? { code: field("code") } : {}),
      name: field("name"), contactPerson: field("contactPerson") || null, phone: field("phone") || null,
      email: field("email") || null, gstNumber: field("gstNumber") || null, paymentTerms: field("paymentTerms") || null,
      address: Object.values(address).some(Boolean) ? address : null,
    };
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(supplier ? "/api/v1/suppliers/" + supplier.id : "/api/v1/suppliers", {
        method: supplier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token },
        body: JSON.stringify(input),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || !result.data) {
        const fields = result.error?.details?.fields;
        const first = fields && Object.entries(fields).find(([, messages]) => messages?.length);
        throw new Error(first ? first[0] + ": " + first[1][0] : result.error?.message ?? "Could not save the supplier.");
      }
      router.push("/suppliers/" + result.data.id);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the supplier.");
      setPending(false);
    }
  }

  return <form className="space-y-5" onSubmit={submit}><div className="grid items-start gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="space-y-5">
    <section className="cs-panel cs-form-section p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">01</span>Vendor identification</h2><p className="cs-muted mt-1 text-xs">Company supplier record and legal name.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Supplier code *<input className="cs-input disabled:text-[#58605c]" defaultValue={supplier?.code ?? ""} disabled={Boolean(supplier)} maxLength={30} minLength={2} name="code" placeholder="SUP-001" required={!supplier} />{supplier && <span className="cs-muted mt-1 block text-[11px]">Code is fixed after creation.</span>}</label><label className="cs-field">Supplier / company name *<input className="cs-input" defaultValue={supplier?.name ?? ""} maxLength={160} minLength={2} name="name" placeholder="Acme Building Supplies" required /></label></div></section>
    <section className="cs-panel p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">02</span>Contact &amp; key personnel</h2><p className="cs-muted mt-1 text-xs">Primary person and communication channels.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field">Primary contact person<input className="cs-input" defaultValue={supplier?.contactPerson ?? ""} maxLength={120} name="contactPerson" placeholder="Contact name" /></label><label className="cs-field">Phone number<input className="cs-input" defaultValue={supplier?.phone ?? ""} maxLength={30} name="phone" type="tel" /></label><label className="cs-field sm:col-span-2">Work email<input className="cs-input" defaultValue={supplier?.email ?? ""} maxLength={254} name="email" type="email" /></label></div></section>
    <section className="cs-panel p-6"><h2 className="cs-section-title"><span className="rounded bg-[#eae7eb] px-2 py-1 text-xs text-[#414942]">03</span>Physical yard &amp; location</h2><p className="cs-muted mt-1 text-xs">Optional. Complete every address field if you add an address.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="cs-field sm:col-span-2">Street address<input className="cs-input" defaultValue={supplier?.address?.line1 ?? ""} maxLength={200} name="line1" /></label><label className="cs-field">City<input className="cs-input" defaultValue={supplier?.address?.city ?? ""} maxLength={100} name="city" /></label><label className="cs-field">State / region<input className="cs-input" defaultValue={supplier?.address?.state ?? ""} maxLength={100} name="state" /></label><label className="cs-field">Postal code<input className="cs-input" defaultValue={supplier?.address?.postalCode ?? ""} maxLength={20} name="postalCode" /></label><label className="cs-field">Country<input className="cs-input" defaultValue={supplier?.address?.country ?? ""} maxLength={100} name="country" /></label></div></section>
  </div><aside className="space-y-5"><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="wallet" />Financial &amp; statutory</h2><p className="cs-muted mt-1 text-xs">Tax identification and payment agreement.</p><div className="mt-6 space-y-4"><label className="cs-field">Tax / GST identifier<input className="cs-input" defaultValue={supplier?.gstNumber ?? ""} maxLength={40} name="gstNumber" /></label><label className="cs-field">Default payment terms<input className="cs-input" defaultValue={supplier?.paymentTerms ?? ""} maxLength={500} name="paymentTerms" placeholder="Net 30 days" /></label></div></section><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Registration requirements</h2><ul className="mt-4 list-disc space-y-3 pl-4 text-xs text-[#414942]"><li>Unique supplier code</li><li>Company name</li><li>Valid email format if supplied</li><li>Complete address if supplied</li></ul></section><section className="cs-panel p-6"><h2 className="cs-section-title"><WorkspaceIcon name="shield" />Authorized registration</h2><p className="cs-muted mt-3 text-xs leading-5">Owner and Admin users can manage supplier records. Changes are logged for your company.</p></section></aside></div>
    {error && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="cs-panel flex flex-wrap items-center justify-end gap-3 p-4"><Link className="cs-secondary" href={supplier ? "/suppliers/" + supplier.id : "/suppliers"}>Cancel</Link><button className="cs-primary disabled:opacity-50" disabled={pending} type="submit"><WorkspaceIcon className="h-4 w-4" name="check" />{pending ? "Saving…" : supplier ? "Save changes" : "Save supplier"}</button></div>
  </form>;
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function OrganizationSettingsForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch("/api/v1/organization", { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.token }, body: JSON.stringify({ name: value.trim() }) });
      const body = await response.json() as { data?: { name: string }; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Could not update the organization.");
      setValue(body.data.name);
      setMessage("Organization name updated.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the organization."); }
    finally { setPending(false); }
  }
  return <form className="mt-5 space-y-4" onSubmit={save}><label className="cs-field max-w-xl">Organization name<input className="cs-input" maxLength={120} minLength={2} onChange={(event) => setValue(event.target.value)} required value={value} /></label><button className="cs-primary disabled:opacity-50" disabled={pending || value.trim() === name} type="submit">Save organization</button>{message && <p aria-live="polite" className="text-sm text-[#144227]">{message}</p>}</form>;
}

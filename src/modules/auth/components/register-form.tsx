"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type RegistrationResult = { success: boolean; error?: { message: string } };

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/register-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const result = await response.json() as RegistrationResult;
      if (!response.ok) throw new Error(result.error?.message ?? "Registration failed.");
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setPending(false);
    }
  }

  if (complete) return <div className="space-y-5">
    <h1 className="text-3xl font-semibold tracking-tight">Workspace created</h1>
    <p className="text-slate-600">Your company workspace for <strong>{email}</strong> is ready. You can sign in now.</p>
    <Link className="inline-block rounded-md bg-emerald-900 px-5 py-3 font-semibold text-white" href="/login">Sign in</Link>
  </div>;

  return <>
    <h1 className="text-3xl font-semibold tracking-tight">Create your company workspace</h1>
    <p className="mt-2 text-slate-600">Start with your company and Owner account.</p>
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">Company name<input autoComplete="organization" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" maxLength={120} minLength={2} name="companyName" required /></label>
      <label className="block text-sm font-medium">Your name<input autoComplete="name" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" maxLength={120} minLength={2} name="ownerName" required /></label>
      <label className="block text-sm font-medium">Work email<input autoComplete="email" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
      <label className="block text-sm font-medium">Organization currency (ISO code)<input autoCapitalize="characters" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5 uppercase" maxLength={3} minLength={3} name="currencyCode" placeholder="EUR" required /></label>
      <p className="text-xs text-slate-500">For example INR, EUR, or USD. One currency is used for this organization.</p>
      <label className="block text-sm font-medium">Password<input autoComplete="new-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" minLength={12} name="password" required type="password" /></label>
      <p className="text-xs text-slate-500">Use at least 12 characters.</p>
      {message && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <button className="w-full rounded-md bg-emerald-900 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Creating workspace…" : "Create workspace"}</button>
    </form>
    <p className="mt-5 text-center text-sm text-slate-600">Already have an account? <Link className="font-semibold text-emerald-800 underline" href="/login">Sign in</Link></p>
  </>;
}

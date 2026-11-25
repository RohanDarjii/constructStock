"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type ResetResult = { success: boolean; error?: { message: string } };

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as ResetResult;
      if (!response.ok) throw new Error(result.error?.message ?? "Could not reset your password.");
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset your password.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
    {!token ? <p className="mt-5 rounded-md bg-amber-50 p-3 text-sm text-amber-900">The reset link is missing. Request a new one.</p>
      : complete ? <p aria-live="polite" className="mt-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Your password has been updated. Sign in with your new password.</p>
        : <><p className="mt-2 text-slate-600">Choose a new password for your ConstructStock account.</p>
          <form className="mt-7 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium">New password<input autoComplete="new-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" minLength={12} maxLength={128} name="password" required type="password" /></label>
            <label className="block text-sm font-medium">Confirm new password<input autoComplete="new-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" minLength={12} maxLength={128} name="confirmation" required type="password" /></label>
            {message && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p>}
            <button aria-busy={pending} className="w-full rounded-md bg-emerald-900 px-4 py-3 font-semibold text-white disabled:opacity-50" data-loading={pending} disabled={pending} type="submit">{pending ? "Updating…" : "Reset password"}</button>
          </form></>}
    <p className="mt-5 text-sm"><Link className="font-semibold text-emerald-800 underline" href={token && !complete ? "/forgot-password" : "/login"}>{token && !complete ? "Request a new link" : "Back to sign in"}</Link></p>
  </>;
}

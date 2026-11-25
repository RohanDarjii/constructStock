"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type ForgotResult = { success: boolean; data?: { message: string }; error?: { message: string } };

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as ForgotResult;
      if (!response.ok) throw new Error(result.error?.message ?? "Could not request a reset link.");
      setMessage(result.data?.message ?? "If an active account uses that address, check its inbox for a reset link.");
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request a reset link.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <h1 className="text-3xl font-semibold tracking-tight">Forgot your password?</h1>
    <p className="mt-2 text-slate-600">Enter your account email and we&apos;ll send a link to reset it.</p>
    {!complete && <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">Email<input autoComplete="email" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" name="email" required type="email" /></label>
      <button aria-busy={pending} className="w-full rounded-md bg-emerald-900 px-4 py-3 font-semibold text-white disabled:opacity-50" data-loading={pending} disabled={pending} type="submit">{pending ? "Sending…" : "Send reset link"}</button>
    </form>}
    {message && <p aria-live="polite" className={`mt-5 rounded-md p-3 text-sm ${complete ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-700"}`}>{message}</p>}
    {complete && <p className="mt-3 text-sm text-slate-600">Check the spam folder too. If no link arrives, verify the address and try again. Links expire in 30 minutes.</p>}
    <p className="mt-5 text-sm"><Link className="font-semibold text-emerald-800 underline" href="/login">Back to sign in</Link></p>
  </>;
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export function AcceptInvitationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const readToken = () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const onHashChange = () => setToken(readToken());
    window.addEventListener("hashchange", onHashChange);
    const timer = window.setTimeout(onHashChange, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", onHashChange); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/v1/users/invitations/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: form.get("password") }),
      });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Could not accept invitation.");
      window.history.replaceState(null, "", window.location.pathname);
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not accept invitation.");
    } finally {
      setPending(false);
    }
  }

  if (complete) return <div className="space-y-5"><h1 className="text-3xl font-semibold tracking-tight">Your account is ready</h1><p className="text-sm text-slate-600">Sign in with the email address your administrator invited.</p><Link className="inline-block rounded-md bg-emerald-900 px-5 py-3 font-semibold text-white" href="/login">Sign in</Link></div>;
  return <div><h1 className="text-3xl font-semibold tracking-tight">Join your team</h1><p className="mt-2 text-sm text-slate-600">Set a password to create the account for the invited email. Your administrator’s role and site assignments will be applied when you activate it.</p>{token === null ? <p className="mt-6 text-sm text-slate-600">Loading invitation…</p> : !token ? <p className="mt-6 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The invitation link is missing. Ask your administrator for a new link.</p> : <form className="mt-7 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Password<input autoComplete="new-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" minLength={12} maxLength={128} name="password" required type="password" /></label><p className="text-xs text-slate-500">Use at least 12 characters.</p>{message && <p aria-live="polite" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}<button className="w-full rounded-md bg-emerald-900 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? "Joining…" : "Activate account"}</button></form>}</div>;
}

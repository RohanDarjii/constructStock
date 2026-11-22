"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LoginResult = { success: boolean; error?: { code: string; message: string } };

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const result = await response.json() as LoginResult;
      if (!response.ok) throw new Error(result.error?.message ?? "Sign-in failed.");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
      setPending(false);
    }
  }

  return <>
    <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
    <p className="mt-2 text-slate-600">Sign in to your ConstructStock workspace.</p>
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">Email<input autoComplete="email" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" name="email" required type="email" /></label>
      <label className="block text-sm font-medium">Password<input autoComplete="current-password" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2.5" name="password" required type="password" /></label>
      {message && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <button className="w-full rounded-md bg-emerald-900 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
    <p className="mt-5 text-center text-sm text-slate-600">New to ConstructStock? <Link className="font-semibold text-emerald-800 underline" href="/register-company">Create a workspace</Link></p>
  </>;
}

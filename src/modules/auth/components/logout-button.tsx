"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Unable to sign out. Please retry.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch("/api/v1/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrf.data.token } });
      if (!response.ok) throw new Error("Unable to sign out. Please retry.");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out.");
      setPending(false);
    }
  }

  return <div className="text-right"><button aria-label="Sign out" aria-busy={pending} className="rounded-md px-2 py-1 text-xs font-semibold text-[#144227] hover:bg-white disabled:opacity-50" data-loading={pending} disabled={pending} onClick={signOut} type="button">{pending ? "Signing out…" : "Sign out"}</button>{error && <p aria-live="polite" className="mt-1 text-xs text-red-700">{error}</p>}</div>;
}

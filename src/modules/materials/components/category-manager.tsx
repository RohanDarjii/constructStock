"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CategoryView } from "../types";

type ApiResult = { data?: CategoryView; error?: { message: string } };

export function CategoryManager({ categories, canManage }: { categories: CategoryView[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function mutate(path: string, method: "POST" | "PATCH", body?: { name: string; description: string }) {
    setPending(true);
    setError("");
    try {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("Your session expired. Sign in again.");
      const csrf = await csrfResponse.json() as { data: { token: string } };
      const response = await fetch(path, {
        method,
        headers: { "X-CSRF-Token": csrf.data.token, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error?.message ?? "Could not update the category.");
      setEditing(null);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the category.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim() };
    const formElement = event.currentTarget;
    const wasEditing = Boolean(editing);
    const saved = await mutate(editing ? `/api/v1/material-categories/${editing.id}` : "/api/v1/material-categories", editing ? "PATCH" : "POST", body);
    if (saved && !wasEditing) formElement.reset();
  }

  return <div className="space-y-6">
    {canManage && <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={editing?.id ?? "new"} onSubmit={submit}>
      <h2 className="text-lg font-semibold">{editing ? `Edit ${editing.name}` : "Create category"}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Name<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" defaultValue={editing?.name} maxLength={120} minLength={2} name="name" required /></label>
        <label className="text-sm font-medium">Description (optional)<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" defaultValue={editing?.description ?? ""} maxLength={1000} name="description" /></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving…" : editing ? "Save category" : "Create category"}</button>{editing && <button className="text-sm text-slate-600 underline" disabled={pending} onClick={() => setEditing(null)} type="button">Cancel</button>}</div>
    </form>}
    {error && <p aria-live="polite" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {categories.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No categories yet. Add one before creating materials.</p> : <div className="space-y-3">{categories.map((category) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4" key={category.id}><div><h2 className="font-semibold">{category.name} {category.status === "ARCHIVED" && <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Archived</span>}</h2>{category.description && <p className="mt-1 text-sm text-slate-600">{category.description}</p>}</div>{canManage && category.status === "ACTIVE" && <div className="flex gap-3"><button className="text-sm text-emerald-800 underline" disabled={pending} onClick={() => setEditing(category)} type="button">Edit</button><button className="text-sm text-red-700 underline" disabled={pending} onClick={() => void mutate(`/api/v1/material-categories/${category.id}/archive`, "POST")} type="button">Archive</button></div>}</div>)}</div>}
  </div>;
}

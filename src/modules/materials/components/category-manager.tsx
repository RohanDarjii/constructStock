"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
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
    } finally { setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: String(form.get("name") ?? "").trim(), description: String(form.get("description") ?? "").trim() };
    const formElement = event.currentTarget;
    const wasEditing = Boolean(editing);
    const saved = await mutate(editing ? "/api/v1/material-categories/" + editing.id : "/api/v1/material-categories", editing ? "PATCH" : "POST", body);
    if (saved && !wasEditing) formElement.reset();
  }

  return <div className="grid items-start gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="space-y-5">{canManage && <form className="cs-panel overflow-hidden" key={editing?.id ?? "new"} onSubmit={submit}><div className="flex items-center justify-between bg-[#f6f2f7] px-5 py-4"><h2 className="cs-section-title"><WorkspaceIcon name="plus" />{editing ? "Edit category" : "Create new category"}</h2><span className="cs-eyebrow">{editing ? "Edit mode" : "New entry"}</span></div><div className="space-y-4 p-5"><label className="cs-field">Category name *<input className="cs-input" defaultValue={editing?.name} maxLength={120} minLength={2} name="name" placeholder="e.g. Structural Steel" required /></label><label className="cs-field">Description<textarea className="cs-input" defaultValue={editing?.description ?? ""} maxLength={1000} name="description" placeholder="Materials and work types included in this category" rows={4} /></label><div className="rounded bg-[#f0edf1] p-4 text-xs leading-5 text-[#414942]"><strong className="text-[#144227]">Archive governance</strong><p className="mt-1">A category referenced by any material cannot be archived. Reassign those materials first.</p></div>{error && <p aria-live="polite" className="rounded bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="flex justify-end gap-2">{editing && <button className="cs-secondary" disabled={pending} onClick={() => setEditing(null)} type="button">Cancel</button>}<button className="cs-primary disabled:opacity-50" disabled={pending} type="submit">{pending ? "Saving…" : editing ? "Save category" : "Create category"}</button></div></div></form>}{!canManage && <div className="cs-panel p-5 text-xs text-[#58605c]">You can view company categories. Only Owner and Admin users can manage them.</div>}</div><div className="space-y-3"><div className="cs-panel flex flex-wrap items-center justify-between gap-2 p-4"><h2 className="text-sm font-bold">Material categories</h2><span className="text-xs text-[#58605c]">{categories.length} shown</span></div>{categories.length === 0 ? <div className="cs-panel p-10 text-center text-sm text-[#58605c]">No categories found. Create one before adding materials.</div> : categories.map((category) => <article className="cs-panel flex flex-wrap items-start justify-between gap-3 p-4" key={category.id}><div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#d7dfda] text-[#144227]"><WorkspaceIcon className="h-4 w-4" name="materials" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{category.name}</h3><span className={"cs-badge " + (category.status === "ARCHIVED" ? "cs-badge-quiet" : "")}>{category.status === "ARCHIVED" ? "Archived" : "Active"}</span></div><p className="cs-muted mt-1 text-xs leading-5">{category.description || "No description provided."}</p></div></div>{canManage && category.status === "ACTIVE" && <div className="flex gap-2"><button className="cs-secondary !min-h-8 !px-2.5 !py-1.5" disabled={pending} onClick={() => setEditing(category)} type="button"><WorkspaceIcon className="h-3.5 w-3.5" name="edit" />Edit</button><button className="cs-secondary !min-h-8 !px-2.5 !py-1.5" disabled={pending} onClick={() => { if (window.confirm("Archive " + category.name + "?")) void mutate("/api/v1/material-categories/" + category.id + "/archive", "POST"); }} type="button"><WorkspaceIcon className="h-3.5 w-3.5" name="archive" />Archive</button></div>}</article>)}</div></div>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { MaterialForm } from "@/modules/materials/components/material-form";
import { listCategories } from "@/modules/materials/services/category-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewMaterialPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("material.manage")) redirect("/materials");
  const categories = await listCategories(identity, { includeArchived: "false" });
  return <div className="mx-auto max-w-4xl"><Link className="text-sm text-emerald-800 underline" href="/materials">← Back to materials</Link><h1 className="mt-4 text-3xl font-semibold">Add material</h1><p className="mt-2 mb-7 text-slate-600">Set the unit and reorder thresholds for this material.</p>{categories.length === 0 && <p className="mb-5 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Create a <Link className="underline" href="/materials/categories">category</Link> first.</p>}<MaterialForm categories={categories} /></div>;
}

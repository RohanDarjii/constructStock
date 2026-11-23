import Link from "next/link";
import { redirect } from "next/navigation";
import { MaterialForm } from "@/modules/materials/components/material-form";
import { listCategories } from "@/modules/materials/services/category-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewMaterialPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("material.manage")) redirect("/materials");
  const categories = await listCategories(identity, { includeArchived: "false" });
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link href="/materials">Materials</Link> / Add material</div><header><p className="cs-eyebrow">Catalogue registry</p><h1 className="mt-2 text-3xl font-extrabold">Add new material</h1><p className="cs-muted mt-1 text-sm">Register a material specification in the company-wide master catalogue.</p></header>{categories.length === 0 && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Create a <Link className="underline" href="/materials/categories">category</Link> first.</p>}<MaterialForm categories={categories} /></div>;
}

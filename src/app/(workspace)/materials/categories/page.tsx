import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryManager } from "@/modules/materials/components/category-manager";
import { listCategoriesQuerySchema } from "@/modules/materials/schemas/catalogue";
import { listCategories } from "@/modules/materials/services/category-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ includeArchived?: string }> }) {
  const identity = await requireIdentity();
  const query = listCategoriesQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const categories = await listCategories(identity, query.data);
  const showArchived = query.data.includeArchived === "true";
  return <div className="space-y-7"><div><Link className="text-sm text-emerald-800 underline" href="/materials">← Back to materials</Link><h1 className="mt-4 text-3xl font-semibold">Material categories</h1><p className="mt-2 text-slate-600">Organize the company catalogue before adding materials.</p></div><div className="flex gap-4 border-b border-slate-200 pb-3 text-sm"><Link aria-current={!showArchived ? "page" : undefined} className={!showArchived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/materials/categories">Active</Link><Link aria-current={showArchived ? "page" : undefined} className={showArchived ? "font-semibold text-emerald-900" : "text-slate-600"} href="/materials/categories?includeArchived=true">Include archived</Link></div><CategoryManager categories={categories} canManage={identity.membership.permissions.includes("material.manage")} /></div>;
}

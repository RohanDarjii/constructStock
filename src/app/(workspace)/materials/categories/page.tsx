import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceIcon } from "@/components/workspace/workspace-icon";
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
  return <div className="space-y-6"><div className="text-xs text-[#58605c]"><Link href="/materials">Materials</Link> / Categories</div><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="cs-eyebrow">Master taxonomy</p><h1 className="mt-2 text-3xl font-extrabold">Material categories management</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Classify approved materials into company-wide construction categories.</p></div><Link className="cs-secondary" href="/materials"><WorkspaceIcon className="h-4 w-4" name="arrow" />Back to materials</Link></header><div className="cs-panel flex items-center gap-3 p-4"><WorkspaceIcon className="h-5 w-5 text-[#144227]" name="shield" /><p className="text-xs text-[#414942]">Category names are unique in this company. Categories with referenced materials remain protected from archival.</p></div><div className="cs-tab-group"><Link aria-current={!showArchived ? "page" : undefined} className={"cs-tab " + (!showArchived ? "cs-tab-active" : "")} href="/materials/categories">Active categories</Link><Link aria-current={showArchived ? "page" : undefined} className={"cs-tab " + (showArchived ? "cs-tab-active" : "")} href="/materials/categories?includeArchived=true">Include archived</Link></div><CategoryManager canManage={identity.membership.permissions.includes("material.manage")} categories={categories} /></div>;
}

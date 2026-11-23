import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MaterialForm } from "@/modules/materials/components/material-form";
import { listCategories } from "@/modules/materials/services/category-service";
import { getMaterial } from "@/modules/materials/services/material-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function EditMaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("material.manage")) redirect("/materials");
  const { materialId } = await params;
  let material;
  try { material = await getMaterial(identity, materialId); } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  if (material.status === "ARCHIVED") redirect(`/materials/${material.id}`);
  const categories = await listCategories(identity, { includeArchived: "false" });
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link href="/materials">Materials</Link> / <Link href={`/materials/${material.id}`}>{material.code}</Link> / Edit</div><header><p className="cs-eyebrow">Catalogue specification</p><h1 className="mt-2 text-3xl font-extrabold">Edit material — {material.code}</h1><p className="cs-muted mt-1 text-sm">Update classification, description, and reorder parameters.</p></header><MaterialForm categories={categories} material={material} /></div>;
}

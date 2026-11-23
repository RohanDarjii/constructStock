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
  return <div className="mx-auto max-w-4xl"><Link className="text-sm text-emerald-800 underline" href={`/materials/${material.id}`}>← Back to material</Link><h1 className="mt-4 text-3xl font-semibold">Edit {material.name}</h1><p className="mt-2 mb-7 text-slate-600">Update catalogue details and stock thresholds.</p><MaterialForm categories={categories} material={material} /></div>;
}

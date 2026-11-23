import Link from "next/link";
import { notFound } from "next/navigation";
import { MaterialActions } from "@/modules/materials/components/material-actions";
import { getMaterial } from "@/modules/materials/services/material-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function MaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const identity = await requireIdentity();
  const { materialId } = await params;
  let material;
  try { material = await getMaterial(identity, materialId); } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const canManage = identity.membership.permissions.includes("material.manage");
  return <div className="space-y-7"><div><Link className="text-sm text-emerald-800 underline" href="/materials">← Back to materials</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">{material.code}</p><h1 className="mt-1 text-3xl font-semibold">{material.name}</h1><p className="mt-2 text-slate-600">{material.category.name} · {material.unit.replaceAll("_", " ")} · {material.status}</p></div>{canManage && <div className="flex items-center gap-3">{material.status !== "ARCHIVED" && <Link className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white" href={`/materials/${material.id}/edit`}>Edit material</Link>}<MaterialActions material={material} /></div>}</div></div>
    {material.description && <p className="rounded-xl border border-slate-200 bg-white p-5 text-slate-700">{material.description}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Stock settings</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Minimum stock level</dt><dd className="font-medium">{material.minimumStockLevel} {material.unit}</dd></div><div><dt className="text-slate-500">Default reorder quantity</dt><dd className="font-medium">{material.defaultReorderQuantity ? `${material.defaultReorderQuantity} ${material.unit}` : "Not set"}</dd></div></dl></section>
  </div>;
}

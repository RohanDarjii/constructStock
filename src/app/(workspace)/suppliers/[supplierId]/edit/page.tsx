import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";
import { getSupplier } from "@/modules/suppliers/services/supplier-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function EditSupplierPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("supplier.manage")) redirect("/suppliers");
  const { supplierId } = await params;
  let supplier;
  try { supplier = await getSupplier(identity, supplierId); } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  if (supplier.status === "ARCHIVED") redirect(`/suppliers/${supplier.id}`);
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link href="/suppliers">Suppliers</Link> / <Link href={`/suppliers/${supplier.id}`}>{supplier.code}</Link> / Edit</div><header><p className="cs-eyebrow">Vendor registration</p><h1 className="mt-2 text-3xl font-extrabold">Edit supplier — {supplier.name}</h1><p className="cs-muted mt-1 text-sm">Update contact, location, tax, and payment details.</p></header><SupplierForm supplier={supplier} /></div>;
}

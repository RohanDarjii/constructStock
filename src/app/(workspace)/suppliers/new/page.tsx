import Link from "next/link";
import { redirect } from "next/navigation";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewSupplierPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("supplier.manage")) redirect("/suppliers");
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link href="/suppliers">Suppliers</Link> / Add new supplier</div><header><p className="cs-eyebrow">Supplier management</p><h1 className="mt-2 text-3xl font-extrabold">Add new supplier</h1><p className="cs-muted mt-1 text-sm">Register a company supplier for future procurement and deliveries.</p></header><SupplierForm /></div>;
}

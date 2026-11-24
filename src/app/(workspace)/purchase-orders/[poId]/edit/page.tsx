import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/modules/purchasing/components/purchase-order-form";
import { getPurchaseOrder, listPurchaseOrderOptions } from "@/modules/purchasing/services/purchase-order-service";
import { hasOrganizationWideSiteAccess, requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ poId: string }> }) {
  const identity = await requireIdentity();
  let order: Awaited<ReturnType<typeof getPurchaseOrder>>;
  try { order = await getPurchaseOrder(identity, (await params).poId); }
  catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
  if (order.status !== "DRAFT" || !identity.membership.permissions.includes("purchase_order.create") || (!hasOrganizationWideSiteAccess(identity) && order.createdBy !== identity.context.userId)) notFound();
  const options = await listPurchaseOrderOptions(identity);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/purchase-orders">Purchase Orders</Link> / <Link href={`/purchase-orders/${order.id}`}>{order.poNumber}</Link> / Edit draft</div><header><h1 className="text-3xl font-extrabold">Edit {order.poNumber}</h1><p className="cs-muted mt-1 text-sm">Update this draft before submitting it for approval.</p></header><PurchaseOrderForm currencyCode={order.currencyCode} options={options} order={order} /></div>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferRequestForm } from "@/modules/transfers/components/transfer-request-form";
import { getTransferOptions } from "@/modules/transfers/services/transfer-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewTransferPage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("transfer.request")) notFound();
  const options = await getTransferOptions(identity);
  return <div className="space-y-6"><div className="cs-eyebrow"><Link href="/transfers">Material Transfers</Link> / New Request</div><header><p className="cs-eyebrow">Inter-site logistics</p><h1 className="mt-2 text-3xl font-extrabold text-[#144227]">New Material Transfer Request</h1><p className="cs-muted mt-1 max-w-2xl text-sm">Request material movement between active sites. Approval reserves stock; dispatch and receipt move physical inventory.</p></header>{options.sourceSites.length && options.destinationSites.length >= 2 ? <TransferRequestForm initialOptions={options} /> : <section className="cs-panel p-10"><h2 className="text-lg font-bold">Two active sites are needed</h2><p className="cs-muted mt-2 text-sm">You need access to an active source site and another active destination site.</p><Link className="cs-secondary mt-5" href="/sites">View sites</Link></section>}</div>;
}

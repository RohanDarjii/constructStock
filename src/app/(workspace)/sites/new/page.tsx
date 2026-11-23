import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteForm } from "@/modules/sites/components/site-form";
import { requireIdentity } from "@/server/auth/authorize";

export default async function NewSitePage() {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("site.manage")) redirect("/sites");
  return <div className="mx-auto max-w-6xl space-y-6"><div className="text-xs text-[#58605c]"><Link className="hover:text-[#144227]" href="/sites">Sites</Link> / Create new site</div><header><p className="cs-eyebrow">Site provisioning</p><h1 className="mt-2 text-3xl font-extrabold">Create new site</h1><p className="cs-muted mt-1 text-sm">Set up a jobsite, project timeline, location, and contact details.</p></header><SiteForm currencyCode={identity.organization.currencyCode} /></div>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { auditQuerySchema } from "@/modules/audit/schemas/audit";
import { listAuditLogs } from "@/modules/audit/services/audit-read-service";
import { requireIdentity } from "@/server/auth/authorize";

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("audit.view")) notFound();
  const parsed = auditQuerySchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const result = await listAuditLogs(identity, parsed.data);
  const next = new URLSearchParams();
  for (const key of ["actorUserId", "entityType", "entityId", "action", "from", "to"] as const) if (parsed.data[key]) next.set(key, parsed.data[key]);
  if (result.pagination.nextCursor) next.set("cursor", result.pagination.nextCursor);
  return <div className="space-y-6"><header><p className="cs-eyebrow">Workspace / Administration</p><h1 className="mt-2 text-3xl font-extrabold">Audit history</h1><p className="cs-muted mt-1 text-sm">Search significant company actions and inspect their attribution.</p></header><form className="cs-panel grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-6" method="get"><label className="cs-field">Action<input className="cs-input" defaultValue={parsed.data.action ?? ""} name="action" placeholder="e.g. goods_receipt.confirmed" /></label><label className="cs-field">Entity type<input className="cs-input" defaultValue={parsed.data.entityType ?? ""} name="entityType" placeholder="e.g. material" /></label><label className="cs-field">Entity ID<input className="cs-input" defaultValue={parsed.data.entityId ?? ""} name="entityId" /></label><label className="cs-field">Actor ID<input className="cs-input" defaultValue={parsed.data.actorUserId ?? ""} name="actorUserId" /></label><label className="cs-field">From<input className="cs-input" defaultValue={parsed.data.from ?? ""} name="from" type="date" /></label><label className="cs-field">To<input className="cs-input" defaultValue={parsed.data.to ?? ""} name="to" type="date" /></label><button className="cs-primary xl:col-start-6" type="submit">Apply filters</button></form><section className="cs-panel overflow-x-auto">{result.auditLogs.length ? <table className="cs-data-table min-w-[760px]"><thead><tr><th>When (UTC)</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead><tbody>{result.auditLogs.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })}</td><td className="font-semibold">{entry.action.replaceAll("_", " ")}</td><td>{entry.entityType} · <span className="font-mono text-xs">{entry.entityId.slice(-12)}</span></td><td>{entry.actor.name}</td><td><Link className="font-bold text-[#144227] hover:underline" href={`/audit-logs/${entry.id}`}>Inspect</Link></td></tr>)}</tbody></table> : <p className="cs-muted p-10 text-center text-sm">No audit events match these filters.</p>}</section>{result.pagination.hasMore && <Link className="cs-secondary" href={`/audit-logs?${next.toString()}`}>Next page</Link>}</div>;
}

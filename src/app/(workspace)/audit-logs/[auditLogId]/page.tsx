import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuditLog } from "@/modules/audit/services/audit-read-service";
import { requireIdentity } from "@/server/auth/authorize";
import { AppError } from "@/shared/errors/app-error";

export default async function AuditLogDetailPage({ params }: { params: Promise<{ auditLogId: string }> }) {
  const identity = await requireIdentity();
  if (!identity.membership.permissions.includes("audit.view")) notFound();
  let entry: Awaited<ReturnType<typeof getAuditLog>>;
  try { entry = await getAuditLog(identity, (await params).auditLogId); }
  catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
  return <div className="space-y-6"><Link className="text-xs font-bold text-[#144227] hover:underline" href="/audit-logs">← Audit history</Link><header><p className="cs-eyebrow">Audit event</p><h1 className="mt-2 text-2xl font-extrabold">{entry.action.replaceAll("_", " ")}</h1><p className="cs-muted mt-1 text-sm">{new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</p></header><section className="cs-panel grid gap-4 p-6 sm:grid-cols-2"><div><p className="cs-stat-label">Actor</p><p className="mt-2 font-semibold">{entry.actor.name}</p><p className="cs-muted font-mono text-xs">{entry.actor.id}</p></div><div><p className="cs-stat-label">Entity</p><p className="mt-2 font-semibold">{entry.entityType}</p><p className="cs-muted break-all font-mono text-xs">{entry.entityId}</p></div><div><p className="cs-stat-label">Event ID</p><p className="mt-2 break-all font-mono text-xs">{entry.id}</p></div><div><p className="cs-stat-label">Recorded IP</p><p className="mt-2 text-sm">{entry.ipAddress ?? "Not recorded"}</p></div></section>{entry.metadata && <section className="cs-panel p-6"><h2 className="font-bold">Event context</h2><pre className="mt-3 overflow-x-auto rounded bg-[#f6f2f7] p-4 text-xs">{JSON.stringify(entry.metadata, null, 2)}</pre></section>}</div>;
}

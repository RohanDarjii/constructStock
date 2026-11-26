import { LoadingSkeleton } from "@/components/feedback/loading-skeleton";

export default function AuditLoading() {
  return <div aria-label="Loading audit history" aria-live="polite" className="space-y-6" role="status"><div><p className="cs-eyebrow">Workspace / Administration</p><h1 className="mt-2 text-3xl font-extrabold">Audit history</h1><p className="cs-muted mt-1 text-sm">Reading company events…</p></div><div className="cs-panel grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <LoadingSkeleton className="h-10" key={index} />)}</div><div className="cs-panel space-y-4 p-5">{Array.from({ length: 6 }, (_, index) => <LoadingSkeleton className="h-10" key={index} />)}</div></div>;
}

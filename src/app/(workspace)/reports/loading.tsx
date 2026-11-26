import { LoadingSkeleton } from "@/components/feedback/loading-skeleton";

export default function ReportsLoading() {
  return <div aria-label="Loading reports" aria-live="polite" className="space-y-6" role="status"><div><p className="cs-eyebrow">Workspace / Analytics</p><h1 className="mt-2 text-3xl font-extrabold">Reports &amp; exports</h1><p className="cs-muted mt-1 text-sm">Reading authorized operational records…</p></div><div className="flex flex-wrap gap-2">{Array.from({ length: 6 }, (_, index) => <LoadingSkeleton className="h-10 w-28" key={index} />)}</div><div className="cs-panel grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <LoadingSkeleton className="h-10" key={index} />)}</div><div className="cs-panel space-y-4 p-5"><LoadingSkeleton className="h-6 w-48" />{Array.from({ length: 5 }, (_, index) => <LoadingSkeleton className="h-10" key={index} />)}</div></div>;
}

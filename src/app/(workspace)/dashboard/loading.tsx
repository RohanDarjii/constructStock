import { LoadingRing } from "@/components/feedback/loading-ring";
import { LoadingSkeleton } from "@/components/feedback/loading-skeleton";

export default function DashboardLoading() {
  return <div className="space-y-6 pb-6" role="status" aria-live="polite" aria-label="Loading dashboard">
    <header><p className="cs-eyebrow">Workspace overview</p><h1 className="mt-1 text-3xl font-extrabold">Dashboard</h1><p className="cs-muted mt-1 text-sm">Loading inventory and site activity…</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <section className="cs-panel h-40 p-5" key={index}><LoadingSkeleton className="h-4 w-28" /><LoadingSkeleton className="mt-9 h-8 w-32" /><LoadingSkeleton className="mt-3 h-3 w-24" /></section>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,.9fr)]"><div className="cs-panel min-h-80 p-6"><LoadingSkeleton className="h-6 w-48" /><div className="mt-8 flex h-56 items-end gap-3">{Array.from({ length: 7 }, (_, index) => <div className="flex-1" key={index} style={{ height: `${35 + index * 8}%` }}><LoadingSkeleton className="h-full w-full" /></div>)}</div></div><div className="cs-panel flex min-h-80 flex-col items-center justify-center gap-3"><LoadingRing /><strong className="text-sm text-[#144227]">Refreshing your dashboard</strong><span className="cs-muted text-xs">Reading the latest authorized site data…</span></div></div>
  </div>;
}

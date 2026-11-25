import { LoadingRing } from "@/components/feedback/loading-ring";
import { LoadingSkeleton } from "@/components/feedback/loading-skeleton";

export default function WastageLoading() {
  return <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading material wastage">
    <div><p className="cs-eyebrow">Home / Material Wastage</p><h1 className="mt-2 text-3xl font-extrabold">Material Wastage</h1><p className="cs-muted mt-1 text-sm">Loading stock loss records and current filters…</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{["Records matching filters", "Affected sites", "Confirmed value lost", "Waste vs received"].map((title) => <section className="cs-panel h-32 p-5" key={title}><p className="cs-eyebrow">{title}</p><LoadingSkeleton className="mt-5 h-8 w-28" /><LoadingSkeleton className="mt-3 h-3 w-36" /></section>)}</div>
    <div className="cs-panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <LoadingSkeleton className="h-10" key={index} />)}</div>
    <div className="cs-panel relative min-h-80 overflow-hidden"><div className="grid grid-cols-4 gap-5 bg-[#f0edf1] p-4 sm:grid-cols-7">{Array.from({ length: 7 }, (_, index) => <LoadingSkeleton className={`h-3 ${index > 3 ? "hidden sm:block" : ""}`} key={index} />)}</div>{Array.from({ length: 4 }, (_, index) => <div className="grid grid-cols-4 gap-5 border-t border-[#eae7eb] p-5 opacity-40 sm:grid-cols-7" key={index}>{Array.from({ length: 7 }, (_, cell) => <LoadingSkeleton className={`h-4 ${cell > 3 ? "hidden sm:block" : ""}`} key={cell} />)}</div>)}<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[2px]"><LoadingRing /><strong className="text-sm text-[#144227]">Refreshing wastage ledger</strong><span className="cs-muted text-xs">Fetching the latest records for your authorized sites…</span></div></div>
  </div>;
}

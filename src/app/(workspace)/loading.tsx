import { LoadingRing } from "@/components/feedback/loading-ring";
import { LoadingSkeleton } from "@/components/feedback/loading-skeleton";

export default function WorkspaceLoading() {
  return <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading workspace page">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="space-y-3"><LoadingSkeleton className="h-3 w-32" /><LoadingSkeleton className="h-9 w-64 max-w-[70vw]" /><LoadingSkeleton className="h-4 w-80 max-w-[85vw]" /></div><div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-xs font-semibold text-[#58605c]"><LoadingRing small /> Loading page…</div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="cs-panel h-36 space-y-5 p-5" key={index}><LoadingSkeleton className="h-3 w-24" /><LoadingSkeleton className="h-8 w-28" /><LoadingSkeleton className="h-3 w-32" /></div>)}</div>
    <div className="cs-panel space-y-4 p-5"><LoadingSkeleton className="h-4 w-36" /><div className="grid gap-3 sm:grid-cols-3"><LoadingSkeleton className="h-10" /><LoadingSkeleton className="h-10" /><LoadingSkeleton className="h-10" /></div></div>
    <div className="cs-panel overflow-hidden"><div className="bg-[#f0edf1] p-4"><LoadingSkeleton className="h-4 w-40" /></div>{Array.from({ length: 4 }, (_, index) => <div className="grid grid-cols-3 gap-6 border-t border-[#f0edf1] p-5 sm:grid-cols-5" key={index}><LoadingSkeleton className="h-4" /><LoadingSkeleton className="h-4" /><LoadingSkeleton className="h-4" /><LoadingSkeleton className="hidden h-4 sm:block" /><LoadingSkeleton className="hidden h-4 sm:block" /></div>)}</div>
  </div>;
}

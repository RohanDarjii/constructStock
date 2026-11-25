import { LoadingRing } from "@/components/feedback/loading-ring";

export default function AppLoading() {
  return <main className="grid min-h-screen place-items-center bg-[#fbf8fc] p-6" role="status" aria-live="polite" aria-label="Loading ConstructStock">
    <div className="w-full max-w-sm rounded-xl border border-[#eae7eb] bg-white p-8 text-center shadow-xl shadow-[#1b1b1e]/5">
      <LoadingRing />
      <h1 className="mt-5 font-[Manrope] text-xl font-bold text-[#1b1b1e]">Opening ConstructStock</h1>
      <p className="mt-2 text-sm text-[#58605c]">Loading your workspace…</p>
      <div className="cs-loading-progress mt-6" aria-hidden="true"><span /></div>
    </div>
  </main>;
}

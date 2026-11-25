export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`cs-loading-skeleton block rounded ${className}`} />;
}

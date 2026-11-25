/** Decorative ring; put the accessible loading message on its parent. */
export function LoadingRing({ small = false }: { small?: boolean }) {
  return <span aria-hidden="true" className={`cs-loading-ring ${small ? "cs-loading-ring-small" : ""}`}>
    <span className="cs-loading-ring-track" />
    <span className="cs-loading-ring-primary" />
    <span className="cs-loading-ring-accent" />
    <span className="cs-loading-ring-center" />
  </span>;
}

// A stat tile: label, value, optional delta against the previous period, and
// an optional caption. The value uses the body sans in proportional figures;
// the delta is text in ink tones with a sign, never colored green/red - up is
// not always good and the tile should not editorialise.
export default function StatTile({
  label,
  value,
  delta,
  caption,
}: {
  label: string
  value: string
  delta?: number | null
  caption?: string
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta)
  const pct = hasDelta ? Math.round(delta * 100) : 0
  const sign = pct > 0 ? '+' : ''
  return (
    <div className="rounded-[14px] border border-border/60 bg-surface px-4 py-3">
      <p className="t-meta text-muted">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
      <p className="mt-0.5 font-sans text-xs text-muted">
        {hasDelta ? (
          <span>
            {sign}
            {pct}% vs previous period
          </span>
        ) : caption ? (
          <span>{caption}</span>
        ) : (
          <span>&nbsp;</span>
        )}
      </p>
    </div>
  )
}

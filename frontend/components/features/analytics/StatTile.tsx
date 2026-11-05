import InfoTip from '@/components/ui/InfoTip'
import type { Copy } from './copy'

// A stat tile: plain-language label with its "i" explanation, the value in
// the body sans with proportional figures, and either a signed change against
// the previous period or a caption. The delta is ink-coloured on purpose - up
// is not always good and the tile should not editorialise.
export default function StatTile({
  copy,
  value,
  delta,
  caption,
}: {
  copy: Copy
  value: string
  delta?: number | null
  caption?: string
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta)
  const pct = hasDelta ? Math.round(delta * 100) : 0
  const sign = pct > 0 ? '+' : ''
  return (
    <div className="rounded-[14px] border border-border/60 bg-surface px-4 py-3">
      <p className="t-meta flex items-center gap-1.5 text-muted">
        {copy.label}
        <InfoTip label={`What "${copy.label}" means`}>{copy.tip}</InfoTip>
      </p>
      <p className="mt-1 font-sans text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
      <p className="mt-0.5 font-sans text-xs text-muted">
        {hasDelta ? (
          <span>
            {sign}
            {pct}% vs the period before
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

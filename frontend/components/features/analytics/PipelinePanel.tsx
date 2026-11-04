import type { PipelineStats } from '@/lib/analytics-api'
import { duration, percent } from './format'

// Translation quality and content velocity for the range. The one number
// worth reading first is "approved unedited": the share of AI Vietnamese a
// bilingual reviewer shipped verbatim.
export default function PipelinePanel({ stats }: { stats: PipelineStats }) {
  const approved = stats.approved_unedited + stats.approved_edited
  const uneditedShare = approved > 0 ? stats.approved_unedited / approved : 0
  const rows: { label: string; value: string }[] = [
    { label: 'Translations produced', value: stats.translations_produced.toLocaleString('en-US') },
    { label: 'Approved unedited', value: `${stats.approved_unedited.toLocaleString('en-US')} (${percent(uneditedShare)})` },
    { label: 'Approved with edits', value: stats.approved_edited.toLocaleString('en-US') },
    { label: 'Awaiting review', value: stats.pending_review.toLocaleString('en-US') },
    { label: 'Median publish to approved', value: stats.median_lead_seconds === null ? '-' : duration(stats.median_lead_seconds) },
    { label: 'Training pairs captured', value: stats.fine_tuning_pairs.toLocaleString('en-US') },
    { label: 'Posts published', value: stats.posts_published.toLocaleString('en-US') },
    { label: 'Reactions added', value: stats.reactions_added.toLocaleString('en-US') },
  ]
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <h3 className="t-card mb-3 text-foreground">Translation pipeline and content</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 font-sans text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
            <dt className="text-muted">{r.label}</dt>
            <dd className="tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

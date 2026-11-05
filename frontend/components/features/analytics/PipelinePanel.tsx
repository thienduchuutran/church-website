import InfoTip from '@/components/ui/InfoTip'
import type { PipelineStats } from '@/lib/analytics-api'
import SectionTitle from './SectionTitle'
import { PIPELINE_ROWS, SECTIONS, type Copy } from './copy'
import { duration, percent } from './format'

// Translation quality and content velocity for the period. The one number
// worth reading first is "Approved without changes": the share of AI
// Vietnamese a bilingual reviewer shipped verbatim.
export default function PipelinePanel({ stats }: { stats: PipelineStats }) {
  const approved = stats.approved_unedited + stats.approved_edited
  const uneditedShare = approved > 0 ? stats.approved_unedited / approved : 0
  const rows: { copy: Copy; value: string }[] = [
    { copy: PIPELINE_ROWS.produced, value: stats.translations_produced.toLocaleString('en-US') },
    { copy: PIPELINE_ROWS.approvedUnedited, value: `${stats.approved_unedited.toLocaleString('en-US')} (${percent(uneditedShare)})` },
    { copy: PIPELINE_ROWS.approvedEdited, value: stats.approved_edited.toLocaleString('en-US') },
    { copy: PIPELINE_ROWS.pending, value: stats.pending_review.toLocaleString('en-US') },
    { copy: PIPELINE_ROWS.lead, value: stats.median_lead_seconds === null ? '-' : duration(stats.median_lead_seconds) },
    { copy: PIPELINE_ROWS.trainingPairs, value: stats.fine_tuning_pairs.toLocaleString('en-US') },
    { copy: PIPELINE_ROWS.postsPublished, value: stats.posts_published.toLocaleString('en-US') },
    { copy: PIPELINE_ROWS.reactionsAdded, value: stats.reactions_added.toLocaleString('en-US') },
  ]
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <SectionTitle copy={SECTIONS.pipeline} />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 font-sans text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.copy.label} className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
            <dt className="flex items-center gap-1.5 text-muted">
              {r.copy.label}
              <InfoTip label={`What "${r.copy.label}" means`}>{r.copy.tip}</InfoTip>
            </dt>
            <dd className="tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

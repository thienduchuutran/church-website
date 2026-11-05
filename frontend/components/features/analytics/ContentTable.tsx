import InfoTip from '@/components/ui/InfoTip'
import type { ContentStat } from '@/lib/analytics-api'
import SectionTitle from './SectionTitle'
import { POST_COLUMNS, SECTIONS, TYPE_LABELS, type Copy } from './copy'
import { longDate } from './format'

function Th({ copy, align = 'left' }: { copy: Copy; align?: 'left' | 'right' }) {
  return (
    <th className={`py-1.5 pr-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {copy.label}
        {copy.tip && <InfoTip label={`What "${copy.label}" means`}>{copy.tip}</InfoTip>}
      </span>
    </th>
  )
}

// "Did anyone read it" - one row per post, reads in the selected period and
// reactions all-time. Sorted by reads server-side.
export default function ContentTable({ items }: { items: ContentStat[] }) {
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <SectionTitle copy={SECTIONS.posts} />
      {items.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-muted">No posts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead className="text-muted">
              <tr>
                <Th copy={POST_COLUMNS.title} />
                <Th copy={POST_COLUMNS.type} />
                <Th copy={POST_COLUMNS.published} />
                <Th copy={POST_COLUMNS.reads} align="right" />
                <Th copy={POST_COLUMNS.reactions} align="right" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.post_id} className="border-t border-border/60">
                  <td className="max-w-[18rem] truncate py-1.5 pr-3 text-foreground" title={p.title}>
                    {p.title}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{TYPE_LABELS[p.type] ?? p.type}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{longDate(p.published_at)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{p.reads.toLocaleString('en-US')}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{p.reactions.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

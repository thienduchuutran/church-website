import type { ContentStat } from '@/lib/analytics-api'
import { longDate } from './format'

const TYPE_LABEL: Record<string, string> = {
  event: 'Event',
  announcement: 'Announcement',
  bible_study: 'Bible study',
  playlist: 'Playlist',
  gallery_album: 'Album',
}

// "Did anyone read it" - one row per post, reads in the selected range and
// reactions all-time. Sorted by reads server-side.
export default function ContentTable({ items }: { items: ContentStat[] }) {
  return (
    <section className="rounded-[14px] border border-border/60 bg-surface p-4">
      <h3 className="t-card mb-3 text-foreground">Posts</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center font-sans text-sm text-muted">No posts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Title</th>
                <th className="py-1.5 pr-3 font-medium">Type</th>
                <th className="py-1.5 pr-3 font-medium">Published</th>
                <th className="py-1.5 pr-3 text-right font-medium">Reads</th>
                <th className="py-1.5 text-right font-medium">Reactions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.post_id} className="border-t border-border/60">
                  <td className="max-w-[18rem] truncate py-1.5 pr-3 text-foreground" title={p.title}>
                    {p.title}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{TYPE_LABEL[p.type] ?? p.type}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{longDate(p.published_at)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{p.reads.toLocaleString('en-US')}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{p.reactions.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

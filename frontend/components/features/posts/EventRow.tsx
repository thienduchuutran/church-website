import { Link } from '@/i18n/routing'
import type { Post } from '@/lib/types'

// EventRow is the compact shape for "what's next": a lavender date block
// with the day numeral in the display face, then the title and one line of
// the body. Events are appointments to scan, not content to read, which is
// why they stop looking identical to announcement cards. The whole row is
// one link into the events page, anchored to the full card there.
//
// A dateless event (admins can post one) shows "TBD" in the block instead of
// vanishing, matching lib/events.ts which keeps it in Upcoming.

// Strip tags for the one-line preview. The body is sanitized HTML from
// Tiptap; this is only a display excerpt, never re-rendered as markup.
function excerpt(html: string | null, max = 90): string {
  if (!html) return ''
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

interface EventRowProps {
  post: Post
  locale: string
  // Shown in the date block when the event has no date yet.
  tbdLabel: string
}

export default function EventRow({ post, locale, tbdLabel }: EventRowProps) {
  const date = post.event_date ? new Date(post.event_date) : null
  const day = date ? date.toLocaleDateString(locale, { day: 'numeric' }) : null
  const month = date ? date.toLocaleDateString(locale, { month: 'short' }) : null
  const preview = excerpt(post.body)

  return (
    <Link
      href={`/events#post-${post.id}`}
      className="card-lift grid grid-cols-[4rem_1fr] items-center gap-4 rounded-[14px] border border-border/60 bg-surface p-3 pr-4"
    >
      <div className="rounded-[10px] bg-panel py-2 text-center">
        {date ? (
          <time dateTime={post.event_date ?? undefined}>
            <span className="block font-heading text-[1.65rem] font-extrabold leading-none text-foreground">
              {day}
            </span>
            <span className="t-meta mt-1 block">{month}</span>
          </time>
        ) : (
          <span className="t-meta block py-2">{tbdLabel}</span>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="t-card truncate">{post.title}</h3>
        {preview && (
          <p className="mt-0.5 truncate font-sans text-[0.875rem] text-muted">{preview}</p>
        )}
      </div>
    </Link>
  )
}

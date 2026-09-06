import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import type { Post } from '@/lib/types'
import ReactionBar from './ReactionBar'
import AdminControls from '@/components/features/admin/AdminControls'
import EventArchiveButton from '@/components/features/admin/EventArchiveButton'
import { RichContent } from '@/components/editor/RichContent'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'

// The card is white paper with a lavender header strip: the strip carries the
// type badge and the dates (the brand at chip scale), the paper carries a
// magenta title and ink body. Three tones per card instead of one, so a feed
// of cards reads as a stack of designed objects rather than white boxes.
//
// Badge: solid magenta for announcements, solid mid magenta for events, both
// with white uppercase text. Every other type sits on the strip in ink - the
// label already says what it is, so it does not need a hue of its own (and
// the palette has none to give).
const TYPE_BADGE: Record<string, { key: string; className: string }> = {
  event: { key: 'event', className: 'bg-accent text-white' },
  announcement: { key: 'announcement', className: 'bg-primary text-white' },
  bible_study: { key: 'bibleStudy', className: 'bg-surface text-foreground' },
  playlist: { key: 'playlist', className: 'bg-surface text-foreground' },
  gallery_album: { key: 'gallery', className: 'bg-surface text-foreground' },
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PostCard({
  post,
  showReactions = true,
}: {
  post: Post
  showReactions?: boolean
}) {
  const t = useTranslations('Post')
  const locale = useLocale()
  const badge = TYPE_BADGE[post.type]
  const badgeLabel = badge ? t(badge.key) : post.type
  const badgeClass = badge ? badge.className : 'bg-surface text-foreground'

  const images = (post.images ?? []).sort((a, b) => a.display_order - b.display_order)
  const heroImage = images[0]

  return (
    // id lets EventRow on the homepage deep-link to this card on /events.
    <article
      id={`post-${post.id}`}
      className="card-lift scroll-mt-24 overflow-hidden rounded-[14px] border border-border/60 bg-surface"
    >
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-panel px-4 py-2.5 sm:px-5">
        <span className={`t-meta rounded-full px-2.5 py-1 text-[0.7rem] ${badgeClass}`}>
          {badgeLabel}
        </span>
        <time className="t-meta" dateTime={post.created_at}>
          {formatDate(post.created_at, locale)}
        </time>
        {post.type === 'event' && post.event_date && (
          <time className="t-meta text-accent" dateTime={post.event_date}>
            {formatDate(post.event_date, locale)}
          </time>
        )}
        {post.type === 'event' && !post.event_date && (
          <span className="t-meta">{t('dateTbd')}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {post.type === 'event' && <EventArchiveButton post={post} />}
          <AdminControls postId={post.id} />
        </div>
      </div>

      <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <h3 className="t-card mb-2 text-primary">{post.title}</h3>
        {/* On a white card the body reads in mauve (8.2:1), not the deep plum
            used on the field: nothing on a card is close to black. */}
        {post.body && <RichContent html={post.body} className="t-body text-muted" />}
      </div>

      {heroImage && (
        <div className="relative aspect-video w-full">
          <Image
            src={heroImage.storage_url}
            alt={post.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 640px"
          />
        </div>
      )}

      <div className="px-4 pb-3 pt-2 sm:px-5 sm:pb-4">
        {post.external_link && (
          <a
            href={post.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3.5 py-1.5 font-sans text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {t('openLink')} ↗
          </a>
        )}
        <ReactionBar postId={post.id} showReactions={showReactions} />
        {/*
          Machine-translation notice. The card already carries reactions and
          actions in the bottom region; the badge sits beneath them as a quiet
          informational footnote, never blocking primary actions. Only renders
          when the backend explicitly set machine_translated - so English
          responses and human-approved Vietnamese stay unbadged.
        */}
        {post.machine_translated && (
          <div className="mt-2 flex justify-end">
            <MachineTranslatedBadge />
          </div>
        )}
      </div>
    </article>
  )
}

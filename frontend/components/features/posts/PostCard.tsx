import Image from 'next/image'
import type { Post } from '@/lib/types'
import ReactionBar from './ReactionBar'
import AdminControls from '@/components/features/admin/AdminControls'

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  event: {
    label: 'Event',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  announcement: {
    label: 'Announcement',
    className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
  bible_study: {
    label: 'Bible Study',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  playlist: {
    label: 'Playlist',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  gallery_album: {
    label: 'Gallery',
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
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
  const badge = TYPE_BADGE[post.type] ?? {
    label: post.type,
    className: 'bg-gray-100 text-gray-700',
  }

  const images = (post.post_images ?? []).sort((a, b) => a.display_order - b.display_order)
  const heroImage = images[0]

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        <time className="text-xs text-muted" dateTime={post.created_at}>
          {formatDate(post.created_at)}
        </time>
        {post.type === 'event' && post.event_date && (
          <time className="text-xs font-medium text-accent" dateTime={post.event_date}>
            <span aria-hidden>📅 </span>
            {formatDate(post.event_date)}
          </time>
        )}
        <div className="ml-auto">
          <AdminControls postId={post.id} />
        </div>
      </div>

      <div className="px-5 pb-4">
        <h3 className="mb-1 text-lg font-bold text-foreground">{post.title}</h3>
        {post.body && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{post.body}</p>
        )}
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

      <div className="px-5 pb-4 pt-2">
        {post.external_link && (
          <a
            href={post.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Open link ↗
          </a>
        )}
        <ReactionBar postId={post.id} showReactions={showReactions} />
      </div>
    </article>
  )
}

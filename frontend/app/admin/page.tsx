'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useEditModal } from '@/lib/edit-modal'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostCard from '@/components/features/posts/PostCard'
import HeroVideoUpload from '@/components/features/admin/HeroVideoUpload'

const POST_TYPES = [
  { type: 'event', label: 'Event' },
  { type: 'announcement', label: 'Announcement' },
  { type: 'bible_study', label: 'Bible Study' },
  { type: 'playlist', label: 'Playlist' },
  { type: 'gallery_album', label: 'Gallery Album' },
] as const

export default function AdminPage() {
  const { session, isAdmin, loading, signIn } = useAuth()
  const { savedAt } = useEditModal()
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState<string | null>(null)

  // The admin dashboard reads through the Go API (RDS) so it always sees the
  // same source-of-truth as the public feeds. We pull a wide window (limit=100)
  // so refreshing after a delete or edit still reflects the full table; the
  // backend caps at 100 server-side anyway. `savedAt` ticks after each modal
  // save so this effect refetches without a full page reload.
  useEffect(() => {
    if (!isAdmin) return
    listPosts({ type: filter ?? undefined, limit: 100 })
      .then(setPosts)
      .catch(() => setPosts([]))
  }, [isAdmin, filter, savedAt])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Admin Access</h1>
        <p className="font-sans text-muted">Sign in with your Google account to manage content.</p>
        <button
          type="button"
          onClick={signIn}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Not Authorized</h1>
        <p className="font-sans text-muted">
          Your account ({session.user.email}) is not in the admin whitelist.
        </p>
        <p className="font-sans text-sm text-muted">Contact a site administrator to request access.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <span className="font-sans text-sm text-muted">{session.user.email}</span>
      </div>

      <div className="mb-8">
        <HeroVideoUpload />
      </div>

      <div className="mb-8 space-y-4">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
          Edit Pages
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            { slug: 'about', label: 'About' },
            { slug: 'connect', label: 'Connect' },
          ].map(({ slug, label }) => (
            <Link
              key={slug}
              href={`/admin/pages/${slug}`}
              className="rounded-lg border border-border bg-surface px-4 py-2 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              Edit {label} Page
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-8 space-y-4">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
          Create New Post
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/gallery/new"
            className="rounded-lg border border-border bg-surface px-4 py-2 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
          >
            + Album
          </Link>
          {POST_TYPES.filter(({ type }) => type !== 'gallery_album').map(({ type, label }) => (
            <Link
              key={type}
              href={`/admin/${type}`}
              className="rounded-lg border border-border bg-surface px-4 py-2 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              + {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 space-y-2">
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">All Posts</h2>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={`rounded-full px-3 py-1 font-display text-xs font-medium transition-colors ${filter === null
                ? 'bg-primary text-white'
                : 'bg-surface text-muted hover:bg-primary/5'
              }`}
          >
            All
          </button>
          {POST_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-full px-3 py-1 font-display text-xs font-medium transition-colors ${filter === type
                  ? 'bg-primary text-white'
                  : 'bg-surface text-muted hover:bg-primary/5'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-12 text-center">
          <p className="font-sans text-lg text-muted">
            {filter ? `No ${filter.replace('_', ' ')} posts yet.` : 'No posts yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} showReactions={false} />
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import PostCard from '@/components/features/posts/PostCard'

const POST_TYPES = [
  { type: 'event', label: 'Event' },
  { type: 'announcement', label: 'Announcement' },
  { type: 'bible_study', label: 'Bible Study' },
  { type: 'playlist', label: 'Playlist' },
  { type: 'gallery_album', label: 'Gallery Album' },
] as const

export default function AdminPage() {
  const { session, isAdmin, loading, signIn } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [filter, setFilter] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return

    let query = supabase
      .from('posts')
      .select('*, post_images(*)')
      .order('created_at', { ascending: false })

    if (filter) query = query.eq('type', filter)

    query.then(({ data }) => setPosts((data as Post[]) ?? []))
  }, [isAdmin, filter])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-foreground">Admin Access</h1>
        <p className="text-muted">Sign in with your Google account to manage content.</p>
        <button
          type="button"
          onClick={signIn}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-light"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <h1 className="text-2xl font-bold text-foreground">Not Authorized</h1>
        <p className="text-muted">
          Your account ({session.user.email}) is not in the admin whitelist.
        </p>
        <p className="text-sm text-muted">Contact a site administrator to request access.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <span className="text-sm text-muted">{session.user.email}</span>
      </div>

      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
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
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              Edit {label} Page
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Create New Post
        </h2>
        <div className="flex flex-wrap gap-2">
          {POST_TYPES.map(({ type, label }) => (
            <Link
              key={type}
              href={`/admin/${type}`}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              + {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">All Posts</h2>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === null
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === type
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
          <p className="text-lg text-muted">
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

import type { Metadata } from 'next'
import { listPostsCached } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Announcements - Our Church',
}

export const revalidate = 60

export default async function AnnouncementsPage() {
  // Fetched through the Go backend (RDS) — Supabase is auth-only. The cache window
  // matches the route's `revalidate = 60` so a freshly-posted announcement appears
  // within ~1 min for everyone.
  let posts: Post[] = []
  try {
    posts = await listPostsCached({ type: 'announcement' }, 60)
  } catch {
    posts = []
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Announcements </h1>
        <AdminFeedActions section="announcement" />
      </div>
      <PostFeed
        posts={posts}
        emptyMessage="No announcements have been posted yet."
      />
    </div>
  )
}

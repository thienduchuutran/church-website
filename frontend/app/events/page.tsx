import type { Metadata } from 'next'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Events — Our Church',
}

export default async function EventsPage() {
  let posts: Post[] = []
  try {
    posts = await listPosts({ type: 'event' })
  } catch {
    posts = []
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Events</h1>
        <AdminFeedActions section="event" />
      </div>
      <PostFeed posts={posts} emptyMessage="No events have been posted yet." />
    </div>
  )
}

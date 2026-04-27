import type { Metadata } from 'next'
import { apiGetCached } from '@/lib/api'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Events — Our Church',
}

export const revalidate = 60

export default async function EventsPage() {
  let posts: Post[] = []
  try {
    posts = (await apiGetCached('/api/v1/posts?type=event', 60)) ?? []
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

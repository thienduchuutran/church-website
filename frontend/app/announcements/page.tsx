import type { Metadata } from 'next'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Announcements - Our Church',
}

export default async function AnnouncementsPage() {
  let posts: Post[] = []
  try {
    posts = await listPosts({ type: 'announcement' })
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

import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Announcements - Our Church',
}

export const revalidate = 60

export default async function AnnouncementsPage() {
  const { data } = await supabase
    .from('posts')
    .select('*, post_images(*)')
    .eq('type', 'announcement')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Announcements</h1>
        <AdminFeedActions section="announcement" />
      </div>
      <PostFeed
        posts={(data as Post[]) ?? []}
        emptyMessage="No announcements have been posted yet."
      />
    </div>
  )
}

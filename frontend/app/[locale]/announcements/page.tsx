import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'

export const metadata: Metadata = {
  title: 'Announcements - Our Church',
}

export default async function AnnouncementsPage() {
  const locale = await getLocale()
  const t = await getTranslations('Pages')
  let posts: Post[] = []
  try {
    posts = await listPosts({ type: 'announcement', locale })
  } catch {
    posts = []
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-10 flex items-start justify-between gap-4">
        <h1 className="t-title">{t('announcementsTitle')}</h1>
        <AdminFeedActions section="announcement" />
      </div>
      <PostFeed
        posts={posts}
        emptyMessage={t('emptyAnnouncements')}
        emptyHint={t('emptyAnnouncementsHint')}
      />
    </div>
  )
}

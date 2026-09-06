import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import PastEventsCarousel from '@/components/features/posts/PastEventsCarousel'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'
import SectionHeader from '@/components/ui/SectionHeader'
import { partitionEvents } from '@/lib/events'

export const metadata: Metadata = {
  title: 'Events - Our Church',
}

export default async function EventsPage() {
  const locale = await getLocale()
  const t = await getTranslations('Pages')
  let posts: Post[] = []
  try {
    posts = await listPosts({ type: 'event', limit: 100, locale })
  } catch {
    posts = []
  }

  // Same shared classifier as the homepage, so the two pages always agree on
  // which events are Upcoming vs Past.
  const { upcoming, past } = partitionEvents(posts)

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-10 flex items-start justify-between gap-4">
        <h1 className="t-title">{t('eventsTitle')}</h1>
        <AdminFeedActions section="event" />
      </div>

      <section aria-labelledby="events-upcoming-heading">
        <SectionHeader id="events-upcoming-heading" title={t('upcoming')} />
        <PostFeed
          posts={upcoming}
          emptyMessage={t('emptyUpcoming')}
          emptyHint={t('emptyUpcomingHint')}
        />
      </section>

      {past.length > 0 && (
        <section aria-labelledby="events-past-heading" className="mt-16">
          <SectionHeader id="events-past-heading" title={t('past')} />
          <PastEventsCarousel posts={past} />
        </section>
      )}
    </div>
  )
}

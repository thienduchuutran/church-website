import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import PastEventsCarousel from '@/components/features/posts/PastEventsCarousel'
import AdminFeedActions from '@/components/features/admin/AdminFeedActions'
import { partitionEvents } from '@/lib/events'

export const metadata: Metadata = {
  title: 'Events - Our Church',
}

export default async function EventsPage() {
  const locale = await getLocale()
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-foreground">Events</h1>
        <AdminFeedActions section="event" />
      </div>

      <section aria-labelledby="events-upcoming-heading">
        <h2
          id="events-upcoming-heading"
          className="mb-4 font-serif text-xl font-semibold text-foreground"
        >
          Upcoming
        </h2>
        <PostFeed posts={upcoming} emptyMessage="No upcoming events." />
      </section>

      {past.length > 0 && (
        <section aria-labelledby="events-past-heading" className="mt-12">
          <h2
            id="events-past-heading"
            className="mb-4 font-serif text-xl font-semibold text-foreground"
          >
            Past Events
          </h2>
          <PastEventsCarousel posts={past} />
        </section>
      )}
    </div>
  )
}

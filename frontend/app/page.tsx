import Link from 'next/link'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'

/** Hero decorative strip: terracotta to warm gold, PRODUCT-allowed gradient use */
const HERO_RULE =
  'linear-gradient(90deg, transparent, #C4663C, #C49A3C, transparent)'

export default async function HomePage() {
  // Both feeds come from the Go backend (RDS) - Supabase is auth-only.
  // Each call's failure is captured independently so a single dead feed doesn't
  // hide the other one. We sort/slice client-side instead of pushing date filters
  // to the server, which keeps the API surface small and the route easy to cache.
  const [announcementsResult, eventsResult] = await Promise.allSettled([
    listPosts({ type: 'announcement', limit: 3 }),
    listPosts({ type: 'event', limit: 20 }),
  ])

  const announcementsError = announcementsResult.status === 'rejected'
  const eventsError = eventsResult.status === 'rejected'

  const announcementPosts: Post[] =
    announcementsResult.status === 'fulfilled' ? announcementsResult.value : []

  const allEvents: Post[] =
    eventsResult.status === 'fulfilled' ? eventsResult.value : []

  // Show only events that haven't happened yet, soonest first, capped at 2.
  const nowIso = new Date().toISOString()
  const eventPosts = allEvents
    .filter((p) => p.event_date && p.event_date >= nowIso)
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    .slice(0, 2)

  const loadErrorMessage =
    announcementsError && eventsError
      ? 'Announcements and events could not be loaded.'
      : announcementsError
        ? 'Announcements could not be loaded.'
        : eventsError
          ? 'Events could not be loaded.'
          : null

  return (
    <div>
      <section className="relative overflow-hidden bg-[#1C1210] px-4 py-[clamp(4.5rem,14vw,8rem)] text-center text-white sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[8%] -top-[18%] h-[min(110vw,44rem)] w-[min(110vw,44rem)] rounded-full"
          style={{
            background:
              'radial-gradient(circle closest-side, rgba(196, 102, 60, 0.2) 0%, transparent 72%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-[min(100%,40rem)]">
          <p className="mb-3 font-sans text-[0.6875rem] font-semibold uppercase leading-normal tracking-[0.08em] text-[#C4663C] sm:mb-4 sm:text-xs">
            Vietnamese Gospel Outreach · Saugus, MA
          </p>
          <h1 className="font-serif text-[clamp(2.25rem,5.5vw,4rem)] font-bold leading-[1.06] tracking-[-0.025em] text-[#f5f0eb]">
            Welcome to{' '}
            <span className="text-[#C4663C] italic">Our Church</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[65ch] font-sans text-base leading-[1.75] text-[#f5f0eb]/85 sm:mt-7 sm:text-[1.0625rem]">
            A community of faith, fellowship, and love. Join us as we grow together.
          </p>
          <div className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10 sm:gap-4">
            <Link
              href="/announcements"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#C4663C] px-5 py-2.5 font-display text-sm font-semibold text-[#fffefb] transition-[filter] duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0eb]"
            >
              Latest announcements
            </Link>
            <Link
              href="/events"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#f5f0eb]/85 bg-transparent px-5 py-2.5 font-display text-sm font-semibold text-[#f5f0eb] transition-colors duration-200 hover:bg-[#f5f0eb]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0eb]"
            >
              Upcoming events
            </Link>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[3px] opacity-40"
          style={{ background: HERO_RULE }}
        />
      </section>

      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-20">
        {loadErrorMessage && (
          <div
            role="alert"
            className="mb-12 rounded-[14px] border border-border bg-surface px-5 py-5 text-foreground sm:mb-14"
          >
            <p className="font-sans text-base font-semibold leading-snug">{loadErrorMessage}</p>
            <p className="mt-2 font-sans text-base leading-relaxed text-muted">
              Check your connection, then reload the page.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary/10 px-3 py-2 font-display text-sm font-medium leading-normal text-primary hover:bg-primary/20"
            >
              Reload home
            </Link>
          </div>
        )}

        <section aria-labelledby="home-announcements-heading" className="scroll-mt-6">
          <div className="mb-4 flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <h2
              id="home-announcements-heading"
              className="min-w-0 max-w-[min(100%,36rem)] flex-1 break-words font-serif text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl sm:leading-tight"
            >
              Latest Announcements
            </h2>
            <Link
              href="/announcements"
              className="inline-flex min-h-11 shrink-0 items-center justify-center self-end rounded-lg px-3 font-display text-sm font-medium leading-normal text-primary underline-offset-4 hover:underline sm:self-auto"
            >
              View all →
            </Link>
          </div>
          <PostFeed posts={announcementPosts} emptyMessage="No announcements yet." />
        </section>

        <section aria-labelledby="home-events-heading" className="mt-16 scroll-mt-6 sm:mt-20 lg:mt-24">
          <div className="mb-4 flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <h2
              id="home-events-heading"
              className="min-w-0 max-w-[min(100%,36rem)] flex-1 break-words font-serif text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl sm:leading-tight"
            >
              Upcoming Events
            </h2>
            <Link
              href="/events"
              className="inline-flex min-h-11 shrink-0 items-center justify-center self-end rounded-lg px-3 font-display text-sm font-medium leading-normal text-primary underline-offset-4 hover:underline sm:self-auto"
            >
              View all →
            </Link>
          </div>
          <PostFeed posts={eventPosts} emptyMessage="No upcoming events." />
        </section>
      </div>
    </div>
  )
}

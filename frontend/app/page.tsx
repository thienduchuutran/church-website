import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'

export const revalidate = 60

export default async function HomePage() {
  const [{ data: announcements, error: announcementsError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .from('posts')
        .select('*, post_images(*)')
        .eq('type', 'announcement')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('posts')
        .select('*, post_images(*)')
        .eq('type', 'event')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(2),
    ])

  const loadErrorMessage =
    announcementsError?.message && eventsError?.message
      ? 'Announcements and events could not be loaded.'
      : announcementsError?.message
        ? 'Announcements could not be loaded.'
        : eventsError?.message
          ? 'Events could not be loaded.'
          : null

  const announcementPosts = (announcements as Post[]) ?? []
  const eventPosts = (events as Post[]) ?? []

  return (
    <div>
      <section className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] px-4 py-20 text-center text-white sm:py-28">
        <p className="mb-3 font-sans text-[0.6875rem] font-semibold uppercase leading-normal tracking-[0.08em] text-[#C4663C] sm:mb-4 sm:text-xs">
          Vietnamese Gospel Outreach
        </p>
        <h1 className="font-serif text-[clamp(2.25rem,5.5vw,4rem)] font-bold leading-[1.06] tracking-[-0.025em] text-white">
          Welcome to{' '}
          <span className="text-[#C4663C] italic">Our Church</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[65ch] font-sans text-base leading-relaxed text-white/85 sm:text-[1.0625rem] sm:leading-[1.7]">
          A community of faith, fellowship, and love. Join us as we grow together.
        </p>
      </section>

      <div className="mx-auto max-w-[760px] space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        {loadErrorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-border bg-surface px-4 py-4 text-foreground shadow-sm"
          >
            <p className="font-sans text-base font-semibold leading-snug">{loadErrorMessage}</p>
            <p className="mt-2 font-sans text-base leading-relaxed text-muted">
              Check your connection, then reload the page.
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary/10 px-3 py-2 font-sans text-sm font-medium leading-normal text-primary hover:bg-primary/20"
            >
              Reload home
            </Link>
          </div>
        )}

        <section aria-labelledby="home-announcements-heading">
          <div className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-4">
            <h2
              id="home-announcements-heading"
              className="min-w-0 max-w-[min(100%,42rem)] break-words font-serif text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl sm:leading-tight"
            >
              Latest Announcements
            </h2>
            <Link
              href="/announcements"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 font-sans text-sm font-medium leading-normal text-primary underline-offset-4 hover:underline"
            >
              View all →
            </Link>
          </div>
          <PostFeed posts={announcementPosts} emptyMessage="No announcements yet." />
        </section>

        <section aria-labelledby="home-events-heading">
          <div className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-4">
            <h2
              id="home-events-heading"
              className="min-w-0 max-w-[min(100%,42rem)] break-words font-serif text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl sm:leading-tight"
            >
              Upcoming Events
            </h2>
            <Link
              href="/events"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 font-sans text-sm font-medium leading-normal text-primary underline-offset-4 hover:underline"
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

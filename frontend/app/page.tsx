import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'

export const revalidate = 60

export default async function HomePage() {
  const [{ data: announcements }, { data: events }] = await Promise.all([
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

  return (
    <div>
      <section className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] px-4 py-20 text-center text-white sm:py-28">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Welcome to Our Church</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
          A community of faith, fellowship, and love. Join us as we grow together.
        </p>
      </section>

      <div className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-foreground">Latest Announcements</h2>
            <Link
              href="/announcements"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
          <PostFeed
            posts={(announcements as Post[]) ?? []}
            emptyMessage="No announcements yet."
          />
        </section>

        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-foreground">Upcoming Events</h2>
            <Link href="/events" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
          <PostFeed posts={(events as Post[]) ?? []} emptyMessage="No upcoming events." />
        </section>
      </div>
    </div>
  )
}

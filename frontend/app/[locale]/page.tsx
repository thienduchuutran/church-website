import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { listPosts } from '@/lib/posts'
import { getHeroVideo } from '@/lib/hero'
import { getConnectSummary } from '@/lib/connect-summary'
import type { Post } from '@/lib/types'
import PostFeed from '@/components/features/posts/PostFeed'
import EventRow from '@/components/features/posts/EventRow'
import PastEventsCarousel from '@/components/features/posts/PastEventsCarousel'
import RecentMoments from '@/components/features/gallery/RecentMoments'
import HeroVideo from '@/components/features/hero/HeroVideo'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import { partitionEvents } from '@/lib/events'

/** Hero decorative strip: rose into deep magenta, in the logo's own gradient
 *  order (its top colour first). PRODUCT-allowed gradient use. */
const HERO_RULE =
  'linear-gradient(90deg, transparent, var(--secondary), var(--primary), transparent)'

export default async function HomePage() {
  // Every feed comes from the Go backend (RDS) - Supabase is auth-only.
  // Each call's failure is captured independently so a single dead feed doesn't
  // hide the others. We sort/slice client-side instead of pushing date filters
  // to the server, which keeps the API surface small and the route easy to cache.
  const locale = await getLocale()
  const t = await getTranslations('Home')
  const [announcementsResult, eventsResult, albumsResult, heroVideoResult, connectResult] =
    await Promise.allSettled([
      listPosts({ type: 'announcement', limit: 3, locale }),
      listPosts({ type: 'event', limit: 30, locale }),
      listPosts({ type: 'gallery_album', limit: 3, locale }),
      getHeroVideo(),
      getConnectSummary(locale),
    ])

  const announcementsError = announcementsResult.status === 'rejected'
  const eventsError = eventsResult.status === 'rejected'
  const heroVideo = heroVideoResult.status === 'fulfilled' ? heroVideoResult.value : null
  const connect =
    connectResult.status === 'fulfilled' ? connectResult.value : { serviceLine: null, addressLine: null }

  const announcementPosts: Post[] =
    announcementsResult.status === 'fulfilled' ? announcementsResult.value : []
  const allEvents: Post[] = eventsResult.status === 'fulfilled' ? eventsResult.value : []
  const albums: Post[] = albumsResult.status === 'fulfilled' ? albumsResult.value : []

  // Split events into the two homepage sections via the shared classifier.
  // Upcoming shows the soonest few (dated and dateless); Past is a swipeable
  // teaser that links to the full archive on /events.
  const { upcoming, past } = partitionEvents(allEvents)
  const upcomingEvents = upcoming.slice(0, 4)
  const pastEvents = past.slice(0, 10)

  const loadErrorMessage =
    announcementsError && eventsError
      ? t('loadErrorBoth')
      : announcementsError
        ? t('loadErrorAnnouncements')
        : eventsError
          ? t('loadErrorEvents')
          : null

  // The service line answers the 3-second "when / where" question. It only
  // renders once the Connect page carries real values - see lib/connect-summary.
  const whenWhere = [connect.serviceLine, connect.addressLine].filter(Boolean).join(' · ')

  return (
    <div>
      {/* Sized to its content on phones; from md up it holds at least 70vh so
          an admin-uploaded video gets real room, with the copy centered in it. */}
      <section className="relative flex items-center overflow-hidden bg-hero-bg text-hero-text md:min-h-[70vh]">
        <HeroVideo videoUrl={heroVideo?.is_visible ? heroVideo.video_url : undefined} />
        {/* Rose glow, top-right. The content sits left, so text and glow
            balance asymmetrically instead of everything stacking centered. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-[8%] -top-[18%] z-[2] h-[min(110vw,44rem)] w-[min(110vw,44rem)] rounded-full"
          style={{
            background:
              'radial-gradient(circle closest-side, color-mix(in srgb, var(--secondary) 24%, transparent) 0%, transparent 72%)',
          }}
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-[clamp(4.5rem,13vw,8rem)] sm:px-6 lg:px-8">
          <div className="max-w-[40rem]">
            <p className="t-meta mb-4 text-secondary">{t('eyebrow')}</p>
            <h1 className="t-display text-hero-text">
              {t.rich('display', {
                em: (chunks) => <em className="not-italic text-secondary">{chunks}</em>,
              })}
            </h1>
            <p className="t-body mt-6 max-w-[52ch] text-[1.0625rem] text-hero-text/85 sm:mt-7">
              {t('description')}
            </p>
            {whenWhere && (
              <p className="mt-6 inline-block border-t border-secondary/50 pt-3 font-sans text-sm text-hero-text/75">
                {whenWhere}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4">
              <Link
                href="/announcements"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hero-text"
              >
                {t('ctaAnnouncements')}
              </Link>
              <Link
                href="/events"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-hero-text/85 bg-transparent px-5 py-2.5 font-sans text-sm font-semibold text-hero-text transition-colors duration-200 hover:bg-hero-text/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hero-text"
              >
                {t('ctaEvents')}
              </Link>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[3px] opacity-60"
          style={{ background: HERO_RULE }}
        />
      </section>

      <div className="mx-auto max-w-[760px] px-4 pt-14 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
        {loadErrorMessage && (
          <div role="alert" className="mb-12 rounded-[14px] bg-panel px-5 py-5 sm:mb-14">
            <p className="t-card">{loadErrorMessage}</p>
            <p className="t-body mt-1 text-[0.95rem] text-muted">{t('loadErrorHint')}</p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-primary-light"
            >
              {t('reload')}
            </Link>
          </div>
        )}

        <section aria-labelledby="home-announcements-heading" className="scroll-mt-6">
          <SectionHeader
            id="home-announcements-heading"
            title={t('announcementsTitle')}
            href="/announcements"
            linkLabel={t('viewAll')}
          />
          <PostFeed
            posts={announcementPosts}
            emptyMessage={t('emptyAnnouncements')}
            emptyHint={t('emptyAnnouncementsHint')}
          />
        </section>

        <section aria-labelledby="home-events-heading" className="mt-16 scroll-mt-6 sm:mt-20 lg:mt-24">
          <SectionHeader
            id="home-events-heading"
            title={t('eventsTitle')}
            href="/events"
            linkLabel={t('viewAll')}
          />
          {upcomingEvents.length > 0 ? (
            <ul role="list" className="stagger-children grid gap-3">
              {upcomingEvents.map((post) => (
                <li key={post.id}>
                  <EventRow post={post} locale={locale} tbdLabel={t('dateTbd')} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('emptyEvents')} hint={t('emptyEventsHint')} />
          )}
        </section>

        <section aria-labelledby="home-moments-heading" className="mt-16 scroll-mt-6 sm:mt-20 lg:mt-24">
          <SectionHeader
            id="home-moments-heading"
            title={t('momentsTitle')}
            href="/gallery"
            linkLabel={t('openGallery')}
          />
          {albums.some((a) => (a.images?.length ?? 0) > 0) ? (
            <RecentMoments albums={albums} />
          ) : (
            <EmptyState title={t('emptyMoments')} hint={t('emptyMomentsHint')} />
          )}
        </section>

        {pastEvents.length > 0 && (
          <section
            aria-labelledby="home-past-events-heading"
            className="mt-16 scroll-mt-6 sm:mt-20 lg:mt-24"
          >
            <SectionHeader
              id="home-past-events-heading"
              title={t('pastTitle')}
              href="/events"
              linkLabel={t('viewAll')}
            />
            <PastEventsCarousel posts={pastEvents} />
          </section>
        )}
      </div>
    </div>
  )
}

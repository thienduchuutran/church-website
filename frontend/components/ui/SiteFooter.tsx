import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import SocialIconBar from '@/components/ui/SocialIconBar'
import { getConnectSummary } from '@/lib/connect-summary'

// SiteFooter is the magenta closing band: the scroll ends on the brand, the
// way the hero opened on the plum band, so the page has a shape instead of
// trailing off. It carries the one invitation the site exists to make
// ("come sit with us"), the service line when the Connect page has one, and
// the social icons.
//
// Server component: it reads the service line through getConnectSummary so
// the footer, the hero and the Connect page can never disagree.
export default async function SiteFooter() {
  const locale = await getLocale()
  const t = await getTranslations('Footer')
  const { serviceLine, addressLine } = await getConnectSummary(locale)
  const whenWhere = [serviceLine, addressLine].filter(Boolean).join(' · ')

  return (
    <footer className="relative mt-24 bg-primary text-white">
      {/* Full-width rule at the top edge: rose into lavender, the logo's
          gradient continuing into its wash. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--secondary), var(--panel-strong), transparent)',
        }}
      />
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 sm:pt-14 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[36rem]">
            <p className="t-section text-white">{t('title')}</p>
            {whenWhere && (
              <p className="mt-3 font-sans text-[0.95rem] text-white/85">{whenWhere}</p>
            )}
            <Link
              href="/connect"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-white px-5 py-2.5 font-sans text-sm font-semibold text-primary transition-colors hover:bg-panel"
            >
              {t('cta')}
            </Link>
          </div>
          {/* The icons are muted-colored by default; on the band they read
              white at 80% and go fully white on hover. Descendant selectors
              beat the anchor's own utility class on specificity. */}
          <div className="[&_a]:text-white/80 [&_a:hover]:text-white [&_a:focus-visible]:text-white">
            <SocialIconBar variant="footer" />
          </div>
        </div>
        <p className="mt-10 border-t border-white/15 pt-5 font-sans text-xs text-white/60">
          © {new Date().getFullYear()} VGOMNE · {t('rights')}
        </p>
      </div>
    </footer>
  )
}

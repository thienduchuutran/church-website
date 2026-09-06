import type { Metadata, Viewport } from 'next'
import { Nunito, Geist_Mono, Baloo_2 } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import '../globals.css'
import { AuthProvider } from '@/lib/auth'
import { EditModalProvider } from '@/lib/edit-modal'
import { UnsavedChangesProvider } from '@/lib/unsaved-changes'
import { ConfirmProvider } from '@/lib/confirm'
import Navbar from '@/components/ui/Navbar'
import SiteFooter from '@/components/ui/SiteFooter'
import PageTransition from '@/components/ui/PageTransition'
import NavigationProgress from '@/components/ui/NavigationProgress'
import { routing } from '@/i18n/routing'
// Temporarily disabled: AI assistant is not working yet. Uncomment this import
// and the <ChatBox /> mount below to re-enable.
// import ChatBox from '@/components/features/assistant/ChatBox'

// Two families, both with soft rounded curves, plus a mono for hex codes. Every family MUST include the 'vietnamese' subset: 'latin'
// alone excludes the precomposed Vietnamese range (U+1EA0-1EF9, e.g. the
// vowels in "Chúa", "Thánh", "được") and the browser silently substitutes a
// fallback font for those glyphs, which makes every tone mark look mismatched
// against its surrounding word. routing.locales is only en/vi, so
// 'vietnamese' is the one extra subset every font needs.
//
// The owner asked for soft curves, and the site already owned the two
// roundest well-hinted Vietnamese faces on Google Fonts: Baloo 2 (the
// calendar's month headline, chosen to bounce like the hand-made paper
// calendars) and Nunito (suggested in PRODUCT.md). Baloo 2 now carries every
// heading, so the calendar masthead and the rest of the site are one voice;
// Nunito carries prose and UI. Earlier pairings (Lora + Inter, Bricolage
// Grotesque + Be Vietnam Pro, Josefin Sans + Gentium Plus) were rejected by
// the owner as either the look every AI-built app has, or too sharp.

// Nunito: prose, nav, buttons, badges, labels, forms (--font-sans, aliased
// to --font-body in globals.css). Variable weight, real italic.
const nunito = Nunito({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  style: ['normal', 'italic'],
})

// Geist Mono only backs hex color codes and DB table names (never
// Vietnamese prose), and Next 16.2.1's bundled Google Fonts manifest
// predates Google adding a 'vietnamese' subset for this family - the type
// checker rejects it even though fonts.google.com now lists one.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Baloo 2: every heading, the hero display line, date numerals, and the
// calendar masthead (--font-heading; --font-marker is an alias in
// globals.css). Rounded and friendly so headlines bounce like the hand-made
// paper calendars. Self-hosted by next/font so it embeds cleanly in the
// calendar PNG export. Built for multi-script use, so it is well-hinted for
// stacked Vietnamese diacritics rather than just glyph-complete. No italic;
// emphasis on a heading is color or weight, never a slanted glyph.
const baloo2 = Baloo_2({
  variable: '--font-heading',
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'Vietnamese Gospel Outreach Ministry New England',
  description:
    'Community hub for our congregation in Saugus, MA: announcements, events, calendar, and resources.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// generateStaticParams pre-renders both /en and /vi at build time. Without
// this, every request to a locale-prefixed URL would go through SSR. Two
// locales is cheap; if we add more, the build cost scales linearly.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

// LocaleLayout is the de-facto root layout for the app. next-intl's docs note
// that with i18n routing, a separate app/layout.tsx is not required - the
// [locale] segment owns <html>/<body> so the `lang` attribute can be set to
// the actual locale instead of a static placeholder.
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  // Guard against locale strings the middleware did not catch (e.g. direct
  // request to /xx). 404 is the right response - we have no translations for
  // unknown locales and serving English under a wrong path would confuse
  // search engines.
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  // setRequestLocale opts this segment into static rendering for the resolved
  // locale, which is what generateStaticParams expects. Skipping this call
  // forces dynamic rendering and defeats the static params optimization.
  setRequestLocale(locale)

  return (
    <html
      lang={locale}
      className={`${nunito.variable} ${geistMono.variable} ${baloo2.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-md bg-primary px-4 py-3 text-sm font-medium text-white outline-none ring-2 ring-primary ring-offset-2 ring-offset-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        {/* Pass `locale` explicitly rather than letting the provider infer it.
            With `localePrefix: 'as-needed'` the default locale is served at the
            unprefixed path (`/`), and a client-side switch back to it (`/vi` ->
            `/`) does not reliably re-init the inferred locale - leaving
            useLocale() stale at `vi` so the LanguageSwitcher highlights the
            wrong language and then no-ops. Binding the prop to the resolved
            segment param forces the client context to track the URL. */}
        <NextIntlClientProvider locale={locale}>
          <AuthProvider>
            {/* ConfirmProvider wraps UnsavedChangesProvider because
                confirmDiscard prompts through it. */}
            <ConfirmProvider>
            <UnsavedChangesProvider>
            <EditModalProvider>
              <NavigationProgress />
              <Navbar />
              <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-20">
                <PageTransition>{children}</PageTransition>
              </main>
              {/* The magenta closing band: the page ends on the brand instead
                  of trailing off into gray. Server component - it reads the
                  service line from the Connect page content. */}
              <SiteFooter />
              {/* <ChatBox /> */}
            </EditModalProvider>
            </UnsavedChangesProvider>
            </ConfirmProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

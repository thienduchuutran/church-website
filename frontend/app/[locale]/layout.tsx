import type { Metadata, Viewport } from 'next'
import { Inter, Lora, DM_Sans, Geist_Mono, Fredoka } from 'next/font/google'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import '../globals.css'
import { AuthProvider } from '@/lib/auth'
import { EditModalProvider } from '@/lib/edit-modal'
import { UnsavedChangesProvider } from '@/lib/unsaved-changes'
import { ConfirmProvider } from '@/lib/confirm'
import Navbar from '@/components/ui/Navbar'
import PageTransition from '@/components/ui/PageTransition'
import NavigationProgress from '@/components/ui/NavigationProgress'
import SocialIconBar from '@/components/ui/SocialIconBar'
import { routing } from '@/i18n/routing'
// Temporarily disabled: AI assistant is not working yet. Uncomment this import
// and the <ChatBox /> mount below to re-enable.
// import ChatBox from '@/components/features/assistant/ChatBox'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

const lora = Lora({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
})

const dmSans = DM_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Fredoka is the calendar's "marker" display face - rounded and friendly so
// the month headline bounces like the hand-made paper calendars, while still
// reading as legitimate next to Lora/Inter. Scoped to the calendar masthead;
// the rest of the site keeps its editorial serif. Self-hosted by next/font so
// it embeds cleanly in the PNG export.
const fredoka = Fredoka({
  variable: '--font-marker',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
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
      className={`${inter.variable} ${lora.variable} ${dmSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-md bg-primary px-4 py-3 text-sm font-medium text-surface outline-none ring-2 ring-primary ring-offset-2 ring-offset-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
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
              <footer className="border-t border-border py-8">
                <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:px-6 lg:px-8">
                  <SocialIconBar variant="footer" />
                  <p className="text-center text-sm text-muted">
                    © {new Date().getFullYear()} VGOMNE. All rights reserved.
                  </p>
                </div>
              </footer>
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

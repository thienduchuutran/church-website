import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

// getRequestConfig is the bridge between the Next.js request lifecycle and
// next-intl's runtime: every server-rendered page calls this exactly once to
// resolve which locale + messages to use. Returning the message bundle lazily
// (via dynamic import) means we ship only the active locale's JSON to the
// edge for each request, not both bundles.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

// next-intl middleware handles three things on every request:
//   1. Detects the locale from URL prefix, cookie, or Accept-Language header.
//   2. Rewrites/redirects URLs so /events stays as /events for the default
//      locale and becomes /vi/events for Vietnamese (per routing.ts
//      localePrefix='as-needed').
//   3. Sets a NEXT_LOCALE cookie so subsequent navigations remember the choice.
export default createMiddleware(routing)

// Skip Next.js internals, static files, the API, and Cloudflare R2 proxy paths.
// Anything else routes through the middleware so locale detection runs once
// per page navigation.
export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}

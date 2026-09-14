import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// The next-intl plugin tells Next.js where to find the request config
// (i18n/request.ts). Without this, server components calling `getLocale()` or
// `getTranslations()` would fail at build time.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Hostnames that should bounce to the canonical domain. Only the exact
// production alias is listed on purpose: Vercel preview deploys also live
// under *.vercel.app (church-website-git-<branch>-*.vercel.app) and must keep
// serving their own build so a branch can be checked before it hits master.
const LEGACY_HOSTS = ['church-website-neon.vercel.app']
const CANONICAL_ORIGIN = 'https://vgomne.org'

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Permanent (308) redirect from the old Vercel address to vgomne.org,
  // keeping the path and query string so shared links still land on the
  // right page. 308 tells browsers and search engines to remember the new
  // home. `has: host` makes the rule fire only for the legacy hostname, so
  // vgomne.org itself never loops.
  async redirects() {
    return LEGACY_HOSTS.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host' as const, value: host }],
      destination: `${CANONICAL_ORIGIN}/:path*`,
      permanent: true,
    }))
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
    ],
  },
}

export default withNextIntl(nextConfig)

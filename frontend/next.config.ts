import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// The next-intl plugin tells Next.js where to find the request config
// (i18n/request.ts). Without this, server components calling `getLocale()` or
// `getTranslations()` would fail at build time.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  reactCompiler: true,
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

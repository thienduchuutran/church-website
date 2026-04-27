import type { Metadata } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import Navbar from '@/components/ui/Navbar'
import PageTransition from '@/components/ui/PageTransition'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const playfair = Playfair_Display({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Our Church',
  description: 'Welcome to our church community — events, announcements, and more.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-md bg-primary px-4 py-3 text-sm font-medium text-surface outline-none ring-2 ring-primary ring-offset-2 ring-offset-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <Navbar />
          <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-20">
            <PageTransition>{children}</PageTransition>
          </main>
          <footer className="border-t border-border py-8">
            <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted sm:px-6 lg:px-8">
              © {new Date().getFullYear()} Our Church. All rights reserved.
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}

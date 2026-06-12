import type { Metadata, Viewport } from 'next'
import { Inter, Lora, DM_Sans, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { EditModalProvider } from '@/lib/edit-modal'
import Navbar from '@/components/ui/Navbar'
import PageTransition from '@/components/ui/PageTransition'
import NavigationProgress from '@/components/ui/NavigationProgress'
import SocialIconBar from '@/components/ui/SocialIconBar'
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

export const metadata: Metadata = {
  title: 'Vietnamese Gospel Outreach Ministry New England',
  description:
    'Community hub for our congregation in Saugus, MA: announcements, events, calendar, and resources.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-md bg-primary px-4 py-3 text-sm font-medium text-surface outline-none ring-2 ring-primary ring-offset-2 ring-offset-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        <AuthProvider>
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
        </AuthProvider>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import CalendarPageClient from './CalendarPageClient'

export const metadata: Metadata = {
  title: 'Calendar | Our Church',
  description: 'Monthly church calendar - events, birthdays, Bible study, and more.',
}

// The viewed month lives in the URL (?y=2026&m=2) so it survives full reloads.
// The one that matters: the locale switch is a hard navigation that forwards
// window.location.search (see LanguageSwitcher), so a visitor reading February
// who flips EN<->VI lands back on February instead of being reset to today.
// CalendarPageClient mirrors month changes into the URL; this page reads them
// back on the next load. Malformed or out-of-range values fall back to today.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const now = new Date()

  const y = Number(Array.isArray(sp.y) ? sp.y[0] : sp.y)
  const m = Number(Array.isArray(sp.m) ? sp.m[0] : sp.m)
  // Bounds are deliberately generous (the church won't schedule outside them)
  // but finite, so a garbage URL can't seed the picker with a nonsense year.
  const validYear = Number.isInteger(y) && y >= 2000 && y <= 2100
  const validMonth = Number.isInteger(m) && m >= 1 && m <= 12

  return (
    <CalendarPageClient
      initialYear={validYear ? y : now.getFullYear()}
      initialMonth={validMonth ? m : now.getMonth() + 1}
    />
  )
}

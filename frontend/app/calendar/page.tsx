import type { Metadata } from 'next'
import CalendarPageClient from './CalendarPageClient'

export const metadata: Metadata = {
  title: 'Calendar | Our Church',
  description: 'Monthly church calendar — events, birthdays, Bible study, and more.',
}

export default function CalendarPage() {
  const now = new Date()
  return (
    <CalendarPageClient
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth() + 1}
    />
  )
}

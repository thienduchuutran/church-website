'use client'

import { useAuth } from '@/lib/auth'
import CalendarShell from '@/components/features/calendar/CalendarShell'
import ExportButton from '@/components/features/calendar/ExportButton'
import { useRef } from 'react'

interface CalendarPageClientProps {
  initialYear: number
  initialMonth: number
}

export default function CalendarPageClient({ initialYear, initialMonth }: CalendarPageClientProps) {
  const { isAdmin, session } = useAuth()
  const calendarRef = useRef<HTMLDivElement>(null)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div ref={calendarRef} className="bg-white p-2">
        <CalendarShell
          initialYear={initialYear}
          initialMonth={initialMonth}
          isAdmin={isAdmin}
          accessToken={session?.access_token ?? null}
        />
      </div>

      {/* Export button — visible to everyone */}
      <div className="mt-8 flex justify-end">
        <ExportButton targetRef={calendarRef} />
      </div>
    </div>
  )
}

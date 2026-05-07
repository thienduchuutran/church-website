'use client'

import { useAuth } from '@/lib/auth'
import CalendarShell from '@/components/features/calendar/CalendarShell'
import ExportButton from '@/components/features/calendar/ExportButton'
import { useRef, useState } from 'react'

interface CalendarPageClientProps {
  initialYear: number
  initialMonth: number
}

export default function CalendarPageClient({ initialYear, initialMonth }: CalendarPageClientProps) {
  const { isAdmin, session } = useAuth()
  const calendarRef = useRef<HTMLDivElement>(null)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  return (
    <div className="mx-auto px-4 py-3 sm:px-6 lg:px-8 flex flex-col items-center">
      {/*
        Live page is fluid (capped at 1100px on wide screens). The 1100px is
        the printed-calendar aspect ratio (~1100 × 840) and is re-applied
        only at export time by ExportButton, so the snapshot always renders
        at the same canvas size regardless of the viewer's viewport.
      */}
      <div ref={calendarRef} className="@container bg-white p-3 w-full max-w-[1100px]">
        <CalendarShell
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
          isAdmin={isAdmin}
          accessToken={session?.access_token ?? null}
        />
      </div>

      {/* Export button - admin only */}
      <div className="mt-3 flex justify-end w-full max-w-[1100px]">
        <ExportButton targetRef={calendarRef} year={year} month={month} isAdmin={isAdmin} />
      </div>
    </div>
  )
}

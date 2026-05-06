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
        Fixed export dimensions - matches the reference printed-calendar
        aspect ratio (~1100 × 840, 1.3:1 landscape). The export PNG will be
        exactly this size × pixelRatio (2x = 2200 × 1680).
      */}
      <div ref={calendarRef} className="bg-white p-3" style={{ width: '1100px' }}>
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
      <div className="mt-3 flex justify-end" style={{ width: '1100px' }}>
        <ExportButton targetRef={calendarRef} year={year} month={month} isAdmin={isAdmin} />
      </div>
    </div>
  )
}

'use client'

import { useAuth } from '@/lib/auth'
import CalendarShell from '@/components/features/calendar/CalendarShell'
import ExportButton, { exportCalendarToPng } from '@/components/features/calendar/ExportButton'
import { useCallback, useRef, useState } from 'react'

interface CalendarPageClientProps {
  initialYear: number
  initialMonth: number
}

export default function CalendarPageClient({ initialYear, initialMonth }: CalendarPageClientProps) {
  const { isAdmin, session } = useAuth()
  const calendarRef = useRef<HTMLDivElement>(null)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [exporting, setExporting] = useState(false)

  // CalendarShell's FAB action sheet calls this; the inline ExportButton on
  // desktop calls its own copy of the same function. Centralizing the state
  // here keeps the live "exporting…" flag in one place.
  const handleExport = useCallback(async () => {
    if (exporting || !calendarRef.current) return
    setExporting(true)
    try {
      await exportCalendarToPng(calendarRef.current, year, month)
    } finally {
      setExporting(false)
    }
  }, [exporting, year, month])

  return (
    <div className="@container mx-auto px-4 py-3 sm:px-6 lg:px-8 flex flex-col items-center">
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
          onExport={handleExport}
          exporting={exporting}
        />
      </div>

      {/* Inline export button - desktop convenience. The FAB inside
          CalendarShell offers the same action and is the primary path on
          mobile where the inline button is visually distant from the grid. */}
      <div className="mt-3 hidden @3xl:flex justify-end w-full max-w-[1100px]">
        <ExportButton targetRef={calendarRef} year={year} month={month} isAdmin={isAdmin} />
      </div>
    </div>
  )
}

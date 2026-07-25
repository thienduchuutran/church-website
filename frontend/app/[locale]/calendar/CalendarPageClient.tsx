'use client'

import { useAuth } from '@/lib/auth'
import CalendarShell from '@/components/features/calendar/CalendarShell'
import ExportButton, { exportCalendarToPng } from '@/components/features/calendar/ExportButton'
import { useCallback, useEffect, useRef, useState } from 'react'

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

  // Mirror the viewed month into the URL (?y=&m=) so it survives full reloads -
  // the locale switch is a hard nav that forwards window.location.search, and
  // page.tsx reads these params back as initialYear/initialMonth. Native
  // history.replaceState (not the Next router) keeps this cosmetic: no server
  // round-trip, no route transition, no history-stack spam from arrow clicks.
  // On the current month the params are dropped so the default view keeps a
  // clean, shareable /calendar URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) {
      params.delete('y')
      params.delete('m')
    } else {
      params.set('y', String(year))
      params.set('m', String(month))
    }
    const query = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash
    )
  }, [year, month])

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

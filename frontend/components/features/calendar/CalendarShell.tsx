'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote } from './types'
import CalendarGrid from './CalendarGrid'
import CalendarSidebar from './CalendarSidebar'
import EventModal from './EventModal'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface CalendarShellProps {
  initialYear: number
  initialMonth: number
  isAdmin: boolean
  accessToken: string | null
}

export default function CalendarShell({
  initialYear,
  initialMonth,
  isAdmin,
  accessToken,
}: CalendarShellProps) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [monthNote, setMonthNote] = useState<CalendarMonthNote | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingNote, setEditingNote] = useState(false)

  const calendarRef = useRef<HTMLDivElement>(null)

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const data: CalendarMonthResponse = await apiGet(`/api/v1/calendar?year=${y}&month=${m}`)
      setEvents(data.events ?? [])
      setMonthNote(data.month_note ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMonth(year, month)
  }, [year, month, fetchMonth])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function handleDayClick(date: string) {
    setSelectedDate(date)
    setEditingEvent(null)
    setEditingNote(false)
    setModalOpen(true)
  }

  function handleEditNote() {
    setSelectedDate(null)
    setEditingEvent(null)
    setEditingNote(true)
    setModalOpen(true)
  }

  function handleEventSaved() {
    setModalOpen(false)
    fetchMonth(year, month)
  }

  const monthName = MONTH_NAMES[month - 1]

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-1">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted">
          Church Calendar
        </p>
        <div className="flex items-baseline gap-6">
          <h1 className="font-serif text-5xl font-bold text-foreground tracking-tight">
            {monthName}
          </h1>
          <span className="font-serif text-3xl text-muted font-light">{year}</span>
          <div className="ml-auto flex items-center gap-4 text-sm font-medium text-muted">
            <button
              onClick={prevMonth}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              ← <span className="hidden sm:inline">{MONTH_NAMES[month === 1 ? 11 : month - 2]}</span>
            </button>
            <button
              onClick={nextMonth}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <span className="hidden sm:inline">{MONTH_NAMES[month === 12 ? 0 : month]}</span> →
            </button>
          </div>
        </div>
        {/* Thin rule under header */}
        <div className="mt-3 border-t-2 border-foreground/80" />
      </div>

      {/* 70/30 grid */}
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        <div ref={calendarRef} className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0">
          <CalendarGrid
            year={year}
            month={month}
            events={events}
            onDayClick={handleDayClick}
            isAdmin={isAdmin}
          />
          <CalendarSidebar
            events={events}
            monthNote={monthNote}
            monthName={monthName}
            year={year}
            isAdmin={isAdmin}
            onEditNote={handleEditNote}
          />
        </div>
      </div>

      {/* Modals */}
      {modalOpen && (
        <EventModal
          mode={editingNote ? 'note' : editingEvent ? 'edit' : 'create'}
          date={selectedDate}
          event={editingEvent}
          monthNote={monthNote}
          year={year}
          month={month}
          accessToken={accessToken}
          onSaved={handleEventSaved}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

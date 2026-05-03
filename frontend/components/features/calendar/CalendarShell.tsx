'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote, MONTH_THEMES, COLOR_MAP } from './types'
import CalendarGrid from './CalendarGrid'
import CalendarIcon from './CalendarIcon'
import EventModal from './EventModal'
import DayEventsModal from './DayEventsModal'

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

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingNote, setEditingNote] = useState(false)

  // Day-events list popup (shown when a day with events is clicked)
  const [dayListDate, setDayListDate] = useState<string | null>(null)
  // When EventModal was opened from the list, remember the date so Cancel can return there
  const [returnToListDate, setReturnToListDate] = useState<string | null>(null)

  const theme = MONTH_THEMES[month]
  const monthName = MONTH_NAMES[month - 1]
  const prevMonthName = MONTH_NAMES[month === 1 ? 11 : month - 2]
  const nextMonthName = MONTH_NAMES[month === 12 ? 0 : month]

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

  useEffect(() => { fetchMonth(year, month) }, [year, month, fetchMonth])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function handleDayClick(date: string) {
    const eventsOnDay = events.filter(e => e.date === date)
    if (eventsOnDay.length > 0) {
      // Day has events → show the list popup (works for everyone)
      setDayListDate(date)
    } else if (isAdmin) {
      // Empty day + admin → straight to create modal
      setSelectedDate(date)
      setEditingEvent(null)
      setEditingNote(false)
      setModalOpen(true)
    }
  }

  function handleEditFromList(ev: CalendarEvent) {
    setReturnToListDate(ev.date)
    setDayListDate(null)
    setSelectedDate(ev.date)
    setEditingEvent(ev)
    setEditingNote(false)
    setModalOpen(true)
  }

  function handleAddFromList() {
    if (!dayListDate) return
    setReturnToListDate(dayListDate)
    setSelectedDate(dayListDate)
    setDayListDate(null)
    setEditingEvent(null)
    setEditingNote(false)
    setModalOpen(true)
  }

  function handleEventModalClose() {
    setModalOpen(false)
    if (returnToListDate) {
      // Reopen the day-events list we came from
      setDayListDate(returnToListDate)
      setReturnToListDate(null)
    }
  }

  function handleEventSaved() {
    // Modal plays its own exit animation, so we don't unmount it here —
    // just clear return-to-list state and refresh the month data.
    setReturnToListDate(null)
    fetchMonth(year, month)
  }

  const birthdays = events.filter(e => e.event_type === 'birthday')
  const bibleStudyDays = events.filter(e => e.event_type === 'bible_study')

  return (
    <>
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>

        {/* Compact horizontal title row */}
        <div className="flex items-end justify-between mb-2 gap-4">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1
              className="font-bold leading-none truncate"
              style={{
                fontSize: '3rem',
                color: theme.title,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '-0.01em',
              }}
            >
              {monthName}
            </h1>
            <span className="text-xl font-light text-gray-400 tracking-wide">{year}</span>
            <span className="text-[9px] font-bold tracking-[0.25em] uppercase text-gray-400 ml-2 hidden md:inline">
              Church Calendar
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={prevMonth}
              className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              ← <span className="hidden sm:inline">{prevMonthName}</span>
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={nextMonth}
              className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              <span className="hidden sm:inline">{nextMonthName}</span> →
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <CalendarGrid
          year={year}
          month={month}
          events={events}
          onDayClick={handleDayClick}
          isAdmin={isAdmin}
          theme={theme}
        />

        {/* Info strip below grid — compact 3 columns */}
        {(birthdays.length > 0 || bibleStudyDays.length > 0 || monthNote?.content || isAdmin) && (
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 px-3 py-2 border-x-2 border-b-2 border-gray-900"
            style={{ backgroundColor: '#fafafa' }}
          >
            {/* Birthdays */}
            <div className="min-w-0">
              <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: theme.title }}>
                Birthdays
              </p>
              {birthdays.length > 0 ? (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {birthdays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.rose
                    return (
                      <div key={e.id} className="flex items-center gap-1 text-[11px] leading-tight">
                        <CalendarIcon iconKey="cake" size={10} color={colors.dot} />
                        <span className="font-semibold" style={{ color: colors.text }}>{e.title}</span>
                        <span className="text-gray-400">{day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">None this month.</p>
              )}
            </div>

            {/* Bible Study */}
            <div className="min-w-0">
              <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: theme.title }}>
                Bible Study
              </p>
              {bibleStudyDays.length > 0 ? (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {bibleStudyDays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.sky
                    return (
                      <div key={e.id} className="flex items-center gap-1 text-[11px] leading-tight">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        <span className="font-semibold text-gray-700">{e.title}</span>
                        <span className="text-gray-400">{day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">None this month.</p>
              )}
            </div>

            {/* Month note */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: theme.title }}>
                  Notes
                </p>
                {isAdmin && (
                  <button
                    onClick={() => { setEditingNote(true); setModalOpen(true) }}
                    className="text-[9px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    {monthNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {monthNote?.content ? (
                <p className="text-[11px] text-gray-600 leading-snug whitespace-pre-wrap line-clamp-3">{monthNote.content}</p>
              ) : (
                <p className="text-[11px] text-gray-400 italic">No note this month.</p>
              )}
            </div>
          </div>
        )}

        {/* Legend — inline, compact */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {[
            { color: 'rose',    label: 'Birthday' },
            { color: 'sky',     label: 'Bible Study' },
            { color: 'violet',  label: 'Prayer' },
            { color: 'amber',   label: 'Announcement' },
            { color: 'slate',   label: 'General' },
          ].map(({ color, label }) => {
            const c = COLOR_MAP[color]
            return (
              <div key={color} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                <span className="text-[9px] text-gray-500 uppercase tracking-wide font-medium">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

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
          onClose={handleEventModalClose}
        />
      )}

      {dayListDate && (
        <DayEventsModal
          date={dayListDate}
          events={events.filter(e => e.date === dayListDate)}
          isAdmin={isAdmin}
          onEdit={handleEditFromList}
          onAddNew={handleAddFromList}
          onClose={() => setDayListDate(null)}
        />
      )}
    </>
  )
}

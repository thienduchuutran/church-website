'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote, MONTH_THEMES, COLOR_MAP } from './types'
import CalendarGrid from './CalendarGrid'
import CalendarIcon from './CalendarIcon'
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

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingNote, setEditingNote] = useState(false)

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
    setSelectedDate(date)
    setEditingEvent(null)
    setEditingNote(false)
    setModalOpen(true)
  }

  function handleEventSaved() {
    setModalOpen(false)
    fetchMonth(year, month)
  }

  const birthdays = events.filter(e => e.event_type === 'birthday')
  const bibleStudyDays = events.filter(e => e.event_type === 'bible_study')

  return (
    <>
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>

        {/* Navigation — outside the print area feel, but still captured */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={prevMonth}
            className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            ← <span className="hidden sm:inline">{prevMonthName}</span>
          </button>

          {/* Large month title */}
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-gray-400 mb-1">
              Church Calendar
            </p>
            <h1
              className="font-bold leading-none"
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
                color: theme.title,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '-0.01em',
              }}
            >
              {monthName}
            </h1>
            <p className="text-base font-light text-gray-400 mt-1 tracking-wide">{year}</p>
          </div>

          <button
            onClick={nextMonth}
            className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            <span className="hidden sm:inline">{nextMonthName}</span> →
          </button>
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

        {/* Info strip below grid */}
        {(birthdays.length > 0 || bibleStudyDays.length > 0 || monthNote?.content || isAdmin) && (
          <div
            className="mt-0 grid grid-cols-1 sm:grid-cols-3 gap-6 px-4 py-4 border-x-2 border-b-2 border-gray-900"
            style={{ backgroundColor: '#fafafa' }}
          >
            {/* Birthdays */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: theme.title }}>
                Birthdays
              </p>
              {birthdays.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {birthdays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.rose
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 text-xs">
                        <CalendarIcon iconKey="cake" size={11} color={colors.dot} />
                        <span className="font-semibold" style={{ color: colors.text }}>{e.title}</span>
                        <span className="text-gray-400">— {monthName.slice(0, 3)} {day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No birthdays this month.</p>
              )}
            </div>

            {/* Bible Study */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: theme.title }}>
                Bible Study
              </p>
              {bibleStudyDays.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {bibleStudyDays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.sky
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        <span className="font-semibold text-gray-700">{e.title}</span>
                        <span className="text-gray-400">— {monthName.slice(0, 3)} {day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No sessions this month.</p>
              )}
            </div>

            {/* Month note */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: theme.title }}>
                  Notes
                </p>
                {isAdmin && (
                  <button
                    onClick={() => { setEditingNote(true); setModalOpen(true) }}
                    className="text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    {monthNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {monthNote?.content ? (
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{monthNote.content}</p>
              ) : (
                <p className="text-xs text-gray-400 italic">No note this month.</p>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
          {[
            { color: 'rose',    label: 'Birthday' },
            { color: 'sky',     label: 'Bible Study' },
            { color: 'violet',  label: 'Prayer' },
            { color: 'amber',   label: 'Announcement' },
            { color: 'slate',   label: 'General' },
          ].map(({ color, label }) => {
            const c = COLOR_MAP[color]
            return (
              <div key={color} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{label}</span>
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
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { apiGet } from '@/lib/api'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote, MONTH_THEMES, COLOR_MAP } from './types'
import CalendarGrid from './CalendarGrid'
import CalendarIcon from './CalendarIcon'
import EventModal from './EventModal'
import DayEventsModal from './DayEventsModal'
import MonthPicker from './MonthPicker'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Direction-aware slide variants. `dir` is +1 (forward in time) or -1 (back).
// New month enters from the side it's traveling toward; old month exits the
// opposite side. Subtle distance (48px) keeps the motion as a hint, not a flourish.
const SLIDE_DISTANCE = 48
const slideVariants = {
  enter: (dir: number) => ({ x: dir * SLIDE_DISTANCE, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: -dir * SLIDE_DISTANCE, opacity: 0 }),
}
// Reduced-motion users get a pure crossfade — no translation.
const reducedMotionVariants = {
  enter:  { opacity: 0 },
  center: { opacity: 1 },
  exit:   { opacity: 0 },
}

interface CalendarShellProps {
  year: number
  month: number
  setYear: (y: number) => void
  setMonth: (m: number) => void
  isAdmin: boolean
  accessToken: string | null
}

export default function CalendarShell({
  year,
  month,
  setYear,
  setMonth,
  isAdmin,
  accessToken,
}: CalendarShellProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [monthNote, setMonthNote] = useState<CalendarMonthNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingNote, setEditingNote] = useState(false)

  // Day-events list popup (shown when a day with events is clicked)
  const [dayListDate, setDayListDate] = useState<string | null>(null)
  // When EventModal was opened from the list, remember the date so Cancel can return there
  const [returnToListDate, setReturnToListDate] = useState<string | null>(null)

  // Month picker popover (anchored to the title)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Direction-aware slide: compare current position (year*12 + month) against
  // the previous one. +1 = forward in time, -1 = backward, 0 = first render.
  // Computed during render so AnimatePresence's `custom` prop sees the latest
  // value before the exit animation captures it.
  const reduceMotion = useReducedMotion()
  const monthPosition = year * 12 + month
  const prevPositionRef = useRef(monthPosition)
  const direction =
    monthPosition === prevPositionRef.current ? 0 : monthPosition > prevPositionRef.current ? 1 : -1
  useEffect(() => {
    prevPositionRef.current = monthPosition
  }, [monthPosition])

  const theme = MONTH_THEMES[month]
  const monthName = MONTH_NAMES[month - 1]
  const prevMonthName = MONTH_NAMES[month === 1 ? 11 : month - 2]
  const nextMonthName = MONTH_NAMES[month === 12 ? 0 : month]

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    setError(null)
    try {
      const data: CalendarMonthResponse = await apiGet(`/api/v1/calendar?year=${y}&month=${m}`)
      setEvents(data.events ?? [])
      setMonthNote(data.month_note ?? null)
    } catch {
      setError("Couldn't load calendar. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMonth(year, month) }, [year, month, fetchMonth])

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1) }
    else setMonth(month + 1)
  }

  const today = new Date()
  const isOnCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  function goToToday() {
    if (isOnCurrentMonth) return
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
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

        {/* Title row — month centered, year right, nav left */}
        <div className="grid grid-cols-3 items-end mb-2 gap-4">
          <div className="flex items-center gap-4 justify-self-start">
            {/* Today — primary nav action, bold pill that echoes the grid border */}
            <button
              onClick={goToToday}
              disabled={isOnCurrentMonth}
              aria-label="Jump to current month"
              className="px-4 py-1.5 rounded-full border-2 border-gray-900 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-900 bg-white hover:bg-gray-900 hover:text-white transition-all duration-200 disabled:opacity-25 disabled:hover:bg-white disabled:hover:text-gray-900 disabled:cursor-default"
            >
              Today
            </button>

            {/* Prev / next — secondary, sit visually below the pill */}
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                aria-label={`Go to ${prevMonthName}`}
                className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                ← <span className="hidden sm:inline">{prevMonthName}</span>
              </button>
              <span className="text-gray-200">|</span>
              <button
                onClick={nextMonth}
                aria-label={`Go to ${nextMonthName}`}
                className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <span className="hidden sm:inline">{nextMonthName}</span> →
              </button>
            </div>
          </div>

          <div className="relative justify-self-center">
            <h1>
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                onMouseDown={(e) => e.stopPropagation()}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                className="font-bold leading-none text-center cursor-pointer transition-opacity hover:opacity-75"
                style={{
                  fontSize: '3rem',
                  color: theme.title,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  letterSpacing: '-0.01em',
                }}
              >
                {monthName}
              </button>
            </h1>
            {pickerOpen && (
              <MonthPicker
                year={year}
                month={month}
                themeColor={theme.title}
                onSelect={(y, m) => {
                  setYear(y)
                  setMonth(m)
                  setPickerOpen(false)
                }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>

          <span className="text-xl font-light text-gray-400 tracking-wide justify-self-end">
            {year}
          </span>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-2 px-3 py-2 border-2 border-gray-900 flex items-center justify-between gap-3"
            style={{ backgroundColor: '#FAF7F2' }}
          >
            <p className="text-xs text-gray-800">{error}</p>
            <button
              onClick={() => fetchMonth(year, month)}
              className="text-xs font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
              style={{ color: '#C4663C' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Calendar grid — direction-aware slide on month change */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={`${year}-${month}`}
              custom={direction}
              variants={reduceMotion ? reducedMotionVariants : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <CalendarGrid
                year={year}
                month={month}
                events={events}
                onDayClick={handleDayClick}
                isAdmin={isAdmin}
                theme={theme}
              />
            </motion.div>
          </AnimatePresence>
        </div>

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
            { color: 'emerald', label: 'Service' },
            { color: 'stone',   label: 'Other' },
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

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { getMonth, upsertMonthSettings } from '@/lib/calendar'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote, CalendarMonthSettings, MONTH_THEMES, COLOR_MAP } from './types'
import CalendarGrid from './CalendarGrid'
import CalendarIcon from './CalendarIcon'
import EventModal from './EventModal'
import DayEventsModal from './DayEventsModal'
import MonthPicker from './MonthPicker'
import AccentColorPicker from './AccentColorPicker'

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
  exit: (dir: number) => ({ x: -dir * SLIDE_DISTANCE, opacity: 0 }),
}
// Reduced-motion users get a pure crossfade — no translation.
const reducedMotionVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
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
  const [monthSettings, setMonthSettings] = useState<CalendarMonthSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Accent picker - only used by admins. liveAccent is an ephemeral preview
  // that overrides the saved color until the picker closes; accentSaved drives
  // the brief "Saved" confirmation pill next to the title.
  const [accentPickerOpen, setAccentPickerOpen] = useState(false)
  const [liveAccent, setLiveAccent] = useState<string | null>(null)
  const [savingAccent, setSavingAccent] = useState(false)
  const [accentSaved, setAccentSaved] = useState(false)

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

  // Live preview wins, then the saved per-month override, then the static
  // MONTH_THEMES fallback. We feed this into a derived theme so CalendarGrid's
  // header bar and today marker tint update without it needing to know about
  // the picker at all.
  const activeAccent = liveAccent ?? monthSettings?.accent_color ?? theme.header
  const activeTheme = { ...theme, header: activeAccent, title: activeAccent }

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true)
    setError(null)
    try {
      const data: CalendarMonthResponse = await getMonth(y, m)
      setEvents(data.events ?? [])
      setMonthNote(data.month_note ?? null)
      setMonthSettings(data.month_settings ?? null)
      setLiveAccent(null)
    } catch {
      setError("Couldn't load calendar. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Persist the accent for the currently-viewed month. The picker awaits the
  // returned promise so it can show its own inline error if the PUT fails.
  async function handleSaveAccent(hex: string) {
    if (!accessToken) throw new Error('not signed in')
    setSavingAccent(true)
    try {
      const saved: CalendarMonthSettings = await upsertMonthSettings(year, month, hex, accessToken)
      setMonthSettings(saved)
      setLiveAccent(null)
      setAccentSaved(true)
      window.setTimeout(() => setAccentSaved(false), 2500)
    } finally {
      setSavingAccent(false)
    }
  }

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

  function handleEditFromStrip(ev: CalendarEvent) {
    setSelectedDate(ev.date)
    setEditingEvent(ev)
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

        {/* Editorial masthead: Today (left) | massive month + year (center) | icon nav (right) */}
        <div className="flex items-center justify-between gap-6 mb-3">

          {/* Today - bold pill, anchors the left side */}
          <button
            onClick={goToToday}
            disabled={isOnCurrentMonth}
            aria-label="Jump to current month"
            className="shrink-0 px-5 py-2 rounded-full border-2 border-gray-900 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-900 bg-white hover:bg-gray-900 hover:text-white transition-all duration-200 disabled:opacity-25 disabled:hover:bg-white disabled:hover:text-gray-900 disabled:cursor-default"
          >
            Today
          </button>

          {/* Center - the headline. Month is the hero, year is a quiet companion. */}
          <div className="relative flex-1 flex justify-center">
            <h1 className="m-0">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                onMouseDown={(e) => e.stopPropagation()}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                aria-label={`${monthName} ${year} - change month`}
                className="group flex items-baseline gap-3 cursor-pointer transition-opacity hover:opacity-70 leading-[0.9]"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  letterSpacing: '-0.025em',
                }}
              >
                <span
                  className="font-bold"
                  style={{ fontSize: '4.5rem', color: activeAccent }}
                >
                  {monthName}
                </span>
                <span
                  className="font-light text-gray-300 group-hover:text-gray-400 transition-colors"
                  style={{ fontSize: '2rem', letterSpacing: '0.01em' }}
                >
                  {year}
                </span>
              </button>
            </h1>
            {pickerOpen && (
              <MonthPicker
                year={year}
                month={month}
                themeColor={activeAccent}
                onSelect={(y, m) => {
                  setYear(y)
                  setMonth(m)
                  setPickerOpen(false)
                }}
                onClose={() => setPickerOpen(false)}
              />
            )}

            {/* Admin-only accent picker trigger - sits to the right of the title.
                Hidden entirely from non-admins so the marketing surface stays
                clean for visitors. */}
            {isAdmin && (
              <div className="absolute top-0 right-0 flex items-center gap-2">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setAccentPickerOpen((v) => !v)}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-haspopup="dialog"
                    aria-expanded={accentPickerOpen}
                    aria-label="Change month accent color"
                    className="flex items-center gap-1 text-[10px] font-medium border border-dashed rounded px-2 py-0.5 transition-colors"
                    style={{
                      borderColor: activeAccent,
                      color: activeAccent,
                      backgroundColor: `${activeAccent}12`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: activeAccent }}
                    />
                    Accent color
                  </button>
                  {accentPickerOpen && (
                    <AccentColorPicker
                      monthLabel={`${monthName} ${year}`}
                      currentAccent={monthSettings?.accent_color ?? theme.header}
                      onPreview={setLiveAccent}
                      onSave={handleSaveAccent}
                      onClose={() => setAccentPickerOpen(false)}
                      saving={savingAccent}
                    />
                  )}
                </div>
                {accentSaved && (
                  <span
                    className="text-[10px] transition-opacity"
                    style={{ color: '#4A7A5C' }}
                  >
                    Saved
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Nav cluster - circular icon buttons, same border family as Today */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={prevMonth}
              aria-label={`Previous month — ${prevMonthName}`}
              title={prevMonthName}
              className="w-11 h-11 flex items-center justify-center rounded-full border-2 border-gray-900 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:scale-95 transition-all duration-200"
            >
              <CaretLeft size={20} weight="bold" />
            </button>
            <button
              onClick={nextMonth}
              aria-label={`Next month - ${nextMonthName}`}
              title={nextMonthName}
              className="w-11 h-11 flex items-center justify-center rounded-full border-2 border-gray-900 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:scale-95 transition-all duration-200"
            >
              <CaretRight size={20} weight="bold" />
            </button>
          </div>
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
                theme={activeTheme}
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
              <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
                Birthdays
              </p>
              {birthdays.length > 0 ? (
                <div className="flex flex-col gap-y-0.5">
                  {birthdays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.rose
                    return (
                      <div
                        key={e.id}
                        onClick={isAdmin ? () => handleEditFromStrip(e) : undefined}
                        className={`flex items-center gap-1 text-[11px] leading-tight rounded px-1 -mx-1 ${isAdmin ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
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
              <p className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
                Bible Study
              </p>
              {bibleStudyDays.length > 0 ? (
                <div className="flex flex-col gap-y-0.5">
                  {bibleStudyDays.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.sky
                    return (
                      <div
                        key={e.id}
                        onClick={isAdmin ? () => handleEditFromStrip(e) : undefined}
                        className={`flex flex-col text-[11px] leading-tight rounded px-1 -mx-1 ${isAdmin ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                          <span className="font-semibold text-gray-700">{e.title}</span>
                          <span className="text-gray-400">{day}</span>
                        </div>
                        {e.private_address && (
                          <p className="text-[10px] text-gray-400 pl-3 leading-tight">{e.private_address}</p>
                        )}
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
                <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: activeAccent }}>
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
            { color: 'rose', label: 'Birthday' },
            { color: 'sky', label: 'Bible Study' },
            { color: 'violet', label: 'Prayer' },
            { color: 'amber', label: 'Announcement' },
            { color: 'slate', label: 'General' },
            { color: 'emerald', label: 'Service' },
            { color: 'stone', label: 'Other' },
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

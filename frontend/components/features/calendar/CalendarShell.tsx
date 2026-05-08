'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaretLeft, CaretRight, Plus, Palette, DownloadSimple } from '@phosphor-icons/react'
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
// Reduced-motion users get a pure crossfade - no translation.
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
  onExport: () => void | Promise<void>
  exporting: boolean
}

export default function CalendarShell({
  year,
  month,
  setYear,
  setMonth,
  isAdmin,
  accessToken,
  onExport,
  exporting,
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

  // FAB action sheet (admin only). Tap the floating "+" → bottom sheet
  // appears with admin actions. Source-tracked so the accent picker can
  // render as a centered modal when triggered from the sheet, vs. as an
  // anchored popover when triggered from the inline desktop button.
  const [fabOpen, setFabOpen] = useState(false)
  const [accentPickerSource, setAccentPickerSource] = useState<'inline' | 'fab' | null>(null)

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
      const data: CalendarMonthResponse = await getMonth(y, m, accessToken)
      setEvents(data.events ?? [])
      setMonthNote(data.month_note ?? null)
      setMonthSettings(data.month_settings ?? null)
      setLiveAccent(null)
    } catch {
      setError("Couldn't load calendar. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [accessToken])

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
    // Modal plays its own exit animation, so we don't unmount it here -
    // just clear return-to-list state and refresh the month data.
    setReturnToListDate(null)
    fetchMonth(year, month)
  }

  // FAB action sheet handlers. The sheet itself is the entry point - tap
  // the "+" to expand it; tap an action to fire it and dismiss.
  function handleFABAccent() {
    setFabOpen(false)
    setAccentPickerSource('fab')
    setAccentPickerOpen(true)
  }

  async function handleFABExport() {
    setFabOpen(false)
    await onExport()
  }

  const birthdays = events.filter(e => e.event_type === 'birthday')
  const bibleStudyDays = events.filter(e => e.event_type === 'bible_study')
  const eventsWithAddress = events.filter(e => e.private_address)

  return (
    <>
      <div className={`transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>

        {/* Editorial masthead. Mobile stacks: row 1 = headline (full width),
            row 2 = Today (left) and nav arrows (right). Desktop is one row:
            Today | headline | nav. Grid-template-areas keeps the markup
            order stable while letting the layout reflow. */}
        <div
          className={[
            'grid items-center gap-y-2 mb-3',
            // Mobile: 2 rows, headline spans full width
            "[grid-template-areas:'headline_headline''today_nav']",
            '[grid-template-columns:1fr_auto]',
            // Desktop: 1 row, today | headline | nav
            "@xl:[grid-template-areas:'today_headline_nav']",
            '@xl:[grid-template-columns:auto_1fr_auto]',
            '@xl:gap-x-6',
          ].join(' ')}
        >

          {/* Today - bold pill. min-h hits the iOS 44px tap-target floor since
              py-2 alone leaves it shy of that. */}
          <button
            onClick={goToToday}
            disabled={isOnCurrentMonth}
            aria-label="Jump to current month"
            data-export-hide
            className="[grid-area:today] justify-self-start shrink-0 inline-flex items-center min-h-[44px] px-4 @xl:px-5 py-2 rounded-full border-2 border-gray-900 font-display text-[10px] @xl:text-[11px] font-bold uppercase tracking-[0.18em] text-gray-900 bg-white hover:bg-gray-900 hover:text-white transition-all duration-200 disabled:opacity-25 disabled:hover:bg-white disabled:hover:text-gray-900 disabled:cursor-default"
          >
            Today
          </button>

          {/* Headline - month is the hero, year is a quiet companion. Sizes
              ramp from mobile (text-4xl/text-lg) to desktop (4.5rem/2rem). */}
          <div className="[grid-area:headline] relative flex justify-center min-w-0">
            <h1 className="m-0 font-serif">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                onMouseDown={(e) => e.stopPropagation()}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                aria-label={`${monthName} ${year} - change month`}
                className="group flex items-baseline gap-1.5 @xl:gap-3 cursor-pointer transition-opacity hover:opacity-70 leading-[0.9] max-w-full"
                style={{
                  fontFamily: 'var(--font-serif)',
                  letterSpacing: '-0.025em',
                }}
              >
                <span
                  className="font-bold truncate text-4xl @xl:text-5xl @3xl:text-[4.5rem]"
                  style={{ color: activeAccent }}
                >
                  {monthName}
                </span>
                <span
                  className="font-light text-gray-300 group-hover:text-gray-400 transition-colors text-lg @xl:text-2xl @3xl:text-[2rem]"
                  style={{ letterSpacing: '0.01em' }}
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
                Hidden on mobile (admin power-user feature; the absolute
                positioning conflicts with the stacked masthead layout). */}
            {isAdmin && (
              <div data-export-hide className="hidden @xl:flex absolute top-0 right-0 items-center gap-2">
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (accentPickerOpen && accentPickerSource === 'inline') {
                        setAccentPickerOpen(false)
                        setAccentPickerSource(null)
                      } else {
                        setAccentPickerSource('inline')
                        setAccentPickerOpen(true)
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-haspopup="dialog"
                    aria-expanded={accentPickerOpen && accentPickerSource === 'inline'}
                    aria-label="Change month accent color"
                    className="flex items-center gap-1 font-display text-[10px] font-medium border border-dashed rounded px-2 py-0.5 transition-colors"
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
                  {accentPickerOpen && accentPickerSource === 'inline' && (
                    <AccentColorPicker
                      monthLabel={`${monthName} ${year}`}
                      currentAccent={monthSettings?.accent_color ?? theme.header}
                      onPreview={setLiveAccent}
                      onSave={handleSaveAccent}
                      onClose={() => {
                        setAccentPickerOpen(false)
                        setAccentPickerSource(null)
                      }}
                      saving={savingAccent}
                    />
                  )}
                </div>
                {accentSaved && (
                  <span
                    className="font-display text-[10px] transition-opacity"
                    style={{ color: '#4A7A5C' }}
                  >
                    Saved
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Nav cluster - circular icon buttons, same border family as Today.
              48x48 hits the Material Design touch-target floor. */}
          <div data-export-hide className="[grid-area:nav] justify-self-end flex items-center gap-1.5 @xl:gap-2 shrink-0">
            <button
              onClick={prevMonth}
              aria-label={`Previous month - ${prevMonthName}`}
              title={prevMonthName}
              className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-900 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:scale-95 transition-all duration-200"
            >
              <CaretLeft size={20} weight="bold" />
            </button>
            <button
              onClick={nextMonth}
              aria-label={`Next month - ${nextMonthName}`}
              title={nextMonthName}
              className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-900 bg-white text-gray-900 hover:bg-gray-900 hover:text-white active:scale-95 transition-all duration-200"
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
            <p className="font-sans text-xs text-gray-800">{error}</p>
            <button
              onClick={() => fetchMonth(year, month)}
              className="font-display text-xs font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
              style={{ color: '#C4663C' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Calendar grid - direction-aware slide on month change */}
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

        {/* Info strip below grid - compact 3 columns */}
        {(birthdays.length > 0 || bibleStudyDays.length > 0 || monthNote?.content || isAdmin) && (
          <div
            className="grid grid-cols-1 @xl:grid-cols-3 gap-x-4 gap-y-2 px-3 py-2 border-2 border-gray-900 mt-4 @3xl:mt-0 @3xl:border-t-0"
            style={{ backgroundColor: '#fafafa' }}
          >
            {/* Birthdays */}
            <div className="min-w-0">
              <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
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
                        <span className="font-display font-semibold" style={{ color: colors.text }}>{e.title}</span>
                        <span className="font-sans text-gray-400">{day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="font-sans text-[11px] text-gray-400 italic">None this month.</p>
              )}
            </div>

            {/* Bible Study */}
            <div className="min-w-0">
              <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
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
                        className={`flex items-center gap-1 text-[11px] leading-tight rounded px-1 -mx-1 ${isAdmin ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        <span className="font-display font-semibold text-gray-700">{e.title}</span>
                        <span className="font-sans text-gray-400">{day}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="font-sans text-[11px] text-gray-400 italic">None this month.</p>
              )}
            </div>

            {/* Month note */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="font-display text-[9px] font-bold tracking-widest uppercase" style={{ color: activeAccent }}>
                  Notes
                </p>
                {isAdmin && (
                  <button
                    onClick={() => { setEditingNote(true); setModalOpen(true) }}
                    className="font-display text-[9px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    {monthNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {monthNote?.content ? (
                <p className="font-sans text-[11px] text-gray-600 leading-snug whitespace-pre-wrap line-clamp-3">{monthNote.content}</p>
              ) : (
                <p className="font-sans text-[11px] text-gray-400 italic">No note this month.</p>
              )}
            </div>

            {/* Locations - admin only, full-width row after the 3 columns, entries flow inline */}
            {isAdmin && eventsWithAddress.length > 0 && (
              <div className="@xl:col-span-3 min-w-0 border-t border-gray-200 pt-2">
                <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
                  Locations
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-0.5">
                  {eventsWithAddress.map(e => {
                    const day = parseInt(e.date.split('-')[2], 10)
                    const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
                    return (
                      <div
                        key={e.id}
                        onClick={() => handleEditFromStrip(e)}
                        className="flex items-center gap-1 text-[11px] leading-tight rounded px-1 -mx-1 cursor-pointer hover:bg-gray-100"
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        <span className="font-display font-semibold text-gray-700">{day} {e.title}</span>
                        <span className="font-sans text-gray-400">-</span>
                        <span className="font-sans text-gray-500">{e.private_address}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend - inline, compact */}
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
                <span className="font-display text-[9px] text-gray-500 uppercase tracking-wide font-medium">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* FAB - admin only, Google Calendar pattern. Tap to open the action
          sheet (Accent + Export). The "+" rotates 45° to become a "×" while
          the sheet is open so the same button serves as the dismiss control.
          data-export-hide keeps it out of the PNG snapshot. */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => setFabOpen((o) => !o)}
          aria-label={fabOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={fabOpen}
          data-export-hide
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3),0_4px_10px_-3px_rgba(0,0,0,0.2)] hover:scale-105 active:scale-95 transition-transform"
          style={{ backgroundColor: activeAccent }}
        >
          <motion.span
            animate={{ rotate: fabOpen ? 45 : 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="flex items-center justify-center"
          >
            <Plus size={26} weight="bold" />
          </motion.span>
        </button>
      )}

      {/* FAB action sheet - admin only. Backdrop fades in; sheet slides up
          from below. Two icon options matching Google Calendar's speed-dial
          pattern. data-export-hide on both layers in case the FAB is open
          when an admin triggers an export from elsewhere. */}
      {isAdmin && (
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              key="fab-sheet"
              data-export-hide
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setFabOpen(false)}
            >
              <div className="absolute inset-0 bg-black/30 backdrop-blur-[6px]" />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Calendar actions"
                className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.25)] pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6"
              >
                {/* Drag handle - visual affordance only */}
                <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-5" />

                <p className="font-display text-[10px] font-bold tracking-[0.18em] uppercase text-gray-500 mb-3">
                  Actions
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleFABAccent}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-gray-200 hover:border-gray-300 active:scale-95 transition-all"
                  >
                    <span
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${activeAccent}1a`, color: activeAccent }}
                    >
                      <Palette size={22} weight="bold" />
                    </span>
                    <span className="font-display text-[11px] font-semibold text-gray-800 leading-tight text-center">
                      Accent color
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFABExport}
                    disabled={exporting}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-gray-200 hover:border-gray-300 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <span
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${activeAccent}1a`, color: activeAccent }}
                    >
                      <DownloadSimple size={22} weight="bold" />
                    </span>
                    <span className="font-display text-[11px] font-semibold text-gray-800 leading-tight text-center">
                      {exporting ? 'Exporting…' : 'Export to Discord'}
                    </span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Accent picker rendered as a centered modal when opened via the FAB.
          The inline (desktop) version still renders inside the masthead as
          a popover - see the conditional in the masthead block. */}
      {accentPickerOpen && accentPickerSource === 'fab' && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[6px]"
          data-export-hide
          onClick={() => {
            setAccentPickerOpen(false)
            setAccentPickerSource(null)
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <AccentColorPicker
              monthLabel={`${monthName} ${year}`}
              currentAccent={monthSettings?.accent_color ?? theme.header}
              onPreview={setLiveAccent}
              onSave={handleSaveAccent}
              onClose={() => {
                setAccentPickerOpen(false)
                setAccentPickerSource(null)
              }}
              saving={savingAccent}
              centered
            />
          </div>
        </div>
      )}

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

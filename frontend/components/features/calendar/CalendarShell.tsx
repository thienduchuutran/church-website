'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocale } from 'next-intl'
import { CaretLeft, CaretRight, Plus, Palette, DownloadSimple } from '@phosphor-icons/react'
import { getMonth, upsertMonthSettings } from '@/lib/calendar'
import { groupEventsByPlace } from '@/lib/places'
import { CalendarMonthResponse, CalendarEvent, CalendarMonthNote, CalendarMonthSettings, MONTH_THEMES, COLOR_MAP, resolveColor } from './types'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'
import CalendarGrid from './CalendarGrid'
import CakeMarker from './CakeMarker'
import EventModal from './EventModal'
import DayEventsModal from './DayEventsModal'
import MonthPicker from './MonthPicker'
import AccentColorPicker from './AccentColorPicker'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Per-letter "nhay nhot" bounce for the month headline. The hand-made paper
// calendars get their playfulness from letters sitting at slightly different
// heights with a small tilt - not from the font itself. We cycle this fixed
// (not random) pattern across the letters so each render is identical and the
// PNG export matches the live page. Offsets are in em so they scale with the
// responsive font size. Negative y = floats up.
const LETTER_BOUNCE: { y: string; r: number }[] = [
  { y: '-0.04em', r: -2.5 },
  { y: '0.025em', r: 2 },
  { y: '-0.025em', r: -1 },
  { y: '0.035em', r: 2.5 },
  { y: '-0.035em', r: -2 },
  { y: '0.015em', r: 1 },
  { y: '-0.02em', r: -1.5 },
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

// A day "has" an event when the date falls anywhere in the event's span.
// end_date is always >= date when set; events without one collapse to a single
// day. YYYY-MM-DD compares lexically.
function eventCoversDate(e: CalendarEvent, date: string): boolean {
  const end = e.end_date ?? e.date
  return e.date <= date && date <= end
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

  // Everyone - admins included - reads the calendar in the locale they picked.
  // A language toggle means "show me the site in this language", and an admin
  // viewing /vi should see exactly what the congregation sees.
  //
  // The edit modal still writes English: an admin token makes the response carry
  // title_source/notes_source alongside the translated title/notes, and
  // EventModal pre-fills from those. Without that pair, saving an event while
  // viewing Vietnamese would overwrite the canonical English source with a
  // machine translation.
  const locale = useLocale()

  // Stamps every in-flight request so a slow earlier response can't overwrite a
  // newer one. Overlapping calls are normal here - fast arrow clicks fire one
  // per month, and the accessToken landing mid-flight refires the current month -
  // and without this the last one to *resolve* won rather than the last one sent.
  const requestSeq = useRef(0)

  const fetchMonth = useCallback(async (y: number, m: number) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data: CalendarMonthResponse = await getMonth(y, m, accessToken, locale)
      if (seq !== requestSeq.current) return
      setEvents(data.events ?? [])
      setMonthNote(data.month_note ?? null)
      setMonthSettings(data.month_settings ?? null)
      setLiveAccent(null)
    } catch {
      if (seq !== requestSeq.current) return
      setError("Couldn't load calendar. Please try again.")
    } finally {
      // Only the newest request owns the spinner - a superseded one clearing it
      // would un-dim the grid while the real fetch is still running.
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [accessToken, locale])

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

  // Fires immediately - the locale no longer depends on the auth check, so there
  // is nothing to wait for. When the token lands it refires the same month, but
  // both responses carry the same language, so the only difference is the
  // admin-only fields (private_address, title_source) appearing.
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
    const eventsOnDay = events.filter(e => eventCoversDate(e, date))
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
  // One row per venue, not per event - see lib/places.ts. The backend already
  // resolved each address to a place, so this is a group-by rather than any
  // kind of address matching.
  const placeGroups = groupEventsByPlace(events)

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
                  aria-label={monthName}
                  className="font-bold whitespace-nowrap text-[2.75rem] @xl:text-6xl @3xl:text-[5rem] leading-[1.05] pb-2 pt-1"
                  style={{ color: activeAccent, fontFamily: 'var(--font-marker)', letterSpacing: '0.015em' }}
                >
                  {monthName.split('').map((ch, i) => {
                    const b = LETTER_BOUNCE[i % LETTER_BOUNCE.length]
                    return (
                      <span
                        key={i}
                        aria-hidden="true"
                        className="inline-block"
                        style={{ transform: `translateY(${b.y}) rotate(${b.r}deg)` }}
                      >
                        {ch}
                      </span>
                    )
                  })}
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
              48x48 hits the Material Design touch-target floor. The admin
              FAB sits at the right edge, accent-filled instead of outlined,
              so the row reads as a hierarchy beat: outline → outline → solid.
              In-flow placement keeps it from obstructing the last week's
              Saturday cells the way a fixed bottom-right FAB would. */}
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
            {isAdmin && (
              <div className="relative z-50 ml-0.5 flex @3xl:hidden">
                {/* FAB itself - floats up (y: -3) when the menu opens, so the
                    motion reads as "lifting" while the items drop below it. */}
                <motion.button
                  type="button"
                  onClick={() => setFabOpen((o) => !o)}
                  aria-label={fabOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={fabOpen}
                  animate={{ y: fabOpen ? -4 : 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 20 }}
                  className="w-12 h-12 flex items-center justify-center rounded-full text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_20px_-3px_rgba(0,0,0,0.35)] active:scale-95 transition-shadow"
                  style={{ backgroundColor: activeAccent }}
                >
                  <motion.span
                    animate={{ rotate: fabOpen ? 45 : 0 }}
                    transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    className="flex items-center justify-center"
                  >
                    <Plus size={22} weight="bold" />
                  </motion.span>
                </motion.button>

                {/* Speed-dial items - drop down from the FAB position with
                    stagger. Each item is a round white circle (icon tinted
                    with the month accent) plus a dark label pill on the left,
                    matching Google Calendar's mobile speed-dial pattern. */}
                <AnimatePresence>
                  {fabOpen && (
                    <motion.div
                      key="fab-menu"
                      variants={{
                        open: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
                        closed: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
                      }}
                      initial="closed"
                      animate="open"
                      exit="closed"
                      className="absolute top-full right-0 mt-3 flex flex-col items-end gap-2.5"
                    >
                      <motion.div
                        variants={{
                          open: { y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } },
                          closed: { y: -16, opacity: 0, scale: 0.5, transition: { duration: 0.15 } },
                        }}
                        className="flex items-center gap-2 justify-end"
                      >
                        <span className="bg-gray-900 text-white font-display text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap shadow-md">
                          Accent color
                        </span>
                        <button
                          type="button"
                          onClick={handleFABAccent}
                          aria-label="Change accent color"
                          className="w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.25)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                          style={{ color: activeAccent }}
                        >
                          <Palette size={22} weight="bold" />
                        </button>
                      </motion.div>
                      <motion.div
                        variants={{
                          open: { y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } },
                          closed: { y: -16, opacity: 0, scale: 0.5, transition: { duration: 0.15 } },
                        }}
                        className="flex items-center gap-2 justify-end"
                      >
                        <span className="bg-gray-900 text-white font-display text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap shadow-md">
                          {exporting ? 'Exporting…' : 'Export to Discord'}
                        </span>
                        <button
                          type="button"
                          onClick={handleFABExport}
                          disabled={exporting}
                          aria-label="Export calendar to Discord"
                          className="w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.25)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
                          style={{ color: activeAccent }}
                        >
                          <DownloadSimple size={22} weight="bold" />
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
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
        {(birthdays.length > 0 || bibleStudyDays.length > 0 || monthNote?.content || isAdmin || placeGroups.length > 0) && (
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
                    const colors = resolveColor(e.color)
                    return (
                      <div
                        key={e.id}
                        onClick={isAdmin ? () => handleEditFromStrip(e) : undefined}
                        className={`flex items-center gap-1 text-[11px] leading-tight rounded px-1 -mx-1 ${isAdmin ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
                        <CakeMarker size={14} />
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
                    const colors = resolveColor(e.color)
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
                    data-export-hide
                    onClick={() => { setEditingNote(true); setModalOpen(true) }}
                    className="font-display text-[9px] text-gray-400 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    {monthNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {monthNote?.content ? (
                <>
                  <p className="font-sans text-[11px] text-gray-600 leading-snug whitespace-pre-wrap">{monthNote.content}</p>
                  {monthNote.machine_translated && (
                    <div className="mt-1">
                      <MachineTranslatedBadge />
                    </div>
                  )}
                </>
              ) : (
                <p className="font-sans text-[11px] text-gray-400 italic">No note this month.</p>
              )}
            </div>

            {/* Locations - one row per VENUE, full-width after the 3 columns.
                This mirrors the paper calendar's footer ("Church Address: 101
                Main St..."), which names each place once no matter how many
                events are held there. The day and the event title are gone on
                purpose: both are already in the grid above, and repeating them
                is what made the church appear eleven times. */}
            {placeGroups.length > 0 && (
              <div className="@xl:col-span-3 min-w-0 border-t border-gray-200 pt-2">
                <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: activeAccent }}>
                  Locations
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-0.5">
                  {placeGroups.map(g => {
                    const colors = resolveColor(g.color)
                    // Dropping the day removed the unambiguous click target: a
                    // row standing for three events has no single event to
                    // open. So it stays clickable only when it means exactly
                    // one - the rest are edited from the grid, which is where
                    // an admin is already looking.
                    const singleEvent = g.events.length === 1 ? g.events[0] : null
                    const clickable = isAdmin && singleEvent !== null
                    return (
                      <div
                        key={g.key}
                        onClick={clickable ? () => handleEditFromStrip(singleEvent) : undefined}
                        className={`flex items-center gap-1 text-[11px] leading-tight rounded px-1 -mx-1 ${clickable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                        {/* A place saved before migration 000014 has no name
                            yet, so the address stands alone rather than
                            printing an empty label. */}
                        {g.name && (
                          <>
                            <span className="font-display font-semibold text-gray-700">{g.name}</span>
                            <span className="font-sans text-gray-400">-</span>
                          </>
                        )}
                        <span className="font-sans text-sky-700">{g.address}</span>
                        {/* Admin-only cue, kept out of the exported image: this
                            address is hidden from the public site (it still
                            prints in the export). */}
                        {isAdmin && g.hiddenFromPublic && (
                          <span className="font-sans text-[9px] uppercase tracking-wide text-gray-400 italic" data-export-hide>hidden</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend - inline, compact. Shown on the live site as a color key, but
            hidden from the PNG export so the shared image reads like the paper
            calendar (which has no legend) rather than the admin tool. */}
        <div data-export-hide className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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

      {/* FAB backdrop - dims the page so the dropped speed-dial items pop.
          Tap anywhere on the dim to close. The items themselves live inside
          the FAB wrapper in the masthead and are stacked above this backdrop
          via the wrapper's z-50. */}
      {isAdmin && (
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              key="fab-backdrop"
              data-export-hide
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setFabOpen(false)}
            />
          )}
        </AnimatePresence>
      )}

      {/* Accent picker rendered as a centered modal when opened via the FAB.
          The inline (desktop) version still renders inside the masthead as
          a popover - see the conditional in the masthead block. */}
      {accentPickerOpen && accentPickerSource === 'fab' && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
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
          events={events.filter(e => eventCoversDate(e, dayListDate))}
          isAdmin={isAdmin}
          onEdit={handleEditFromList}
          onAddNew={handleAddFromList}
          onClose={() => setDayListDate(null)}
        />
      )}
    </>
  )
}

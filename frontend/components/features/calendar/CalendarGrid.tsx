'use client'

import { useMemo } from 'react'
import { CalendarEvent, COLOR_MAP } from './types'
import CalendarIcon from './CalendarIcon'

interface CalendarGridProps {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick?: (date: string) => void
  isAdmin?: boolean
  theme: { title: string; header: string; headerText: string }
}

const DAY_HEADERS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function CalendarGrid({
  year,
  month,
  events,
  onDayClick,
  isAdmin = false,
  theme,
}: CalendarGridProps) {
  const { firstDayOfWeek, daysInMonth } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    return { firstDayOfWeek: firstDay.getDay(), daysInMonth: lastDay.getDate() }
  }, [year, month])

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {}
    for (const e of events) {
      const day = parseInt(e.date.split('-')[2], 10)
      if (!map[day]) map[day] = []
      map[day].push(e)
    }
    return map
  }, [events])

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = isCurrentMonth ? today.getDate() : -1

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function formatDate(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Single-letter day-of-week headers for the mobile month grid. Each cell
  // is ~49px on a 375px screen, so a 3-letter abbreviation would crowd the
  // day number. This matches Google Calendar's mobile month layout.
  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  return (
    <div className="w-full">
      {/* Desktop: full 7-col grid with full event chips. Gated by container
          width (not viewport) so the export PNG - which forces the wrapper
          to 1100px regardless of device - always renders this editorial
          layout, even when the admin is exporting from a phone. */}
      <div className="hidden @3xl:block border-2 border-gray-900 overflow-hidden">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={[
                'py-2.5 text-center font-display text-sm font-bold',
                i < 6 ? 'border-r border-gray-900' : '',
              ].join(' ')}
              style={{ backgroundColor: theme.header, color: theme.headerText }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className={[
                    'border-t border-gray-900 min-h-[115px] bg-gray-50',
                    (idx % 7) < 6 ? 'border-r border-gray-900' : '',
                  ].join(' ')}
                />
              )
            }

            const dayEvents = eventsByDay[day] ?? []
            const isToday = day === todayDay
            const dateStr = formatDate(day)

            const isClickable = isAdmin || dayEvents.length > 0

            return (
              <div
                key={day}
                onClick={() => isClickable && onDayClick?.(dateStr)}
                className={[
                  'border-t border-gray-900 min-h-[115px] px-1.5 py-1.5 flex flex-col gap-1 bg-white',
                  (idx % 7) < 6 ? 'border-r border-gray-900' : '',
                  isClickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : '',
                ].join(' ')}
              >
                {/* Date number - top right */}
                <span
                  data-today-circle={isToday ? 'true' : undefined}
                  className={[
                    'font-sans text-xs font-semibold self-end leading-none mb-0.5',
                    isToday ? 'rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white' : 'text-gray-600',
                  ].join(' ')}
                  style={isToday ? { backgroundColor: theme.header } : {}}
                >
                  {day}
                </span>

                {/* Events */}
                {dayEvents.map((e) => {
                  const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-1 min-w-0 rounded px-1.5 py-0.5 font-display text-[11px] font-semibold leading-tight"
                      title={e.notes ?? e.title}
                      style={{
                        backgroundColor: colors.bg,
                        borderLeft: `2.5px solid ${colors.dot}`,
                        color: colors.text,
                      }}
                    >
                      <CalendarIcon iconKey={e.icon} size={10} color={colors.dot} />
                      <span className="truncate">{e.title}</span>
                    </div>
                  )
                })}

                {isAdmin && dayEvents.length === 0 && (
                  <span className="font-sans text-[9px] text-gray-300 mt-auto">+</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: compact 7-column month grid - Google Calendar pattern. Every
          day is visible; events render as thin colored bars under the day
          number. Tap any day with events (or any day for admins) to open the
          day-events sheet, where full titles and details live. Container-
          gated so the export PNG never falls back to this view. */}
      <div className="block @3xl:hidden">
        {/* Day-of-week strip - single letters because 3-letter abbreviations
            crowd a 49px column on a 375px viewport. */}
        <div className="grid grid-cols-7 mb-1.5">
          {DAY_LETTERS.map((letter, i) => (
            <div
              key={i}
              className="text-center font-display text-[10px] font-bold uppercase tracking-[0.15em] py-1"
              style={{ color: theme.header }}
            >
              {letter}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 border-t border-l border-gray-200 rounded-sm overflow-hidden">
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="border-r border-b border-gray-200 min-h-[60px] bg-gray-50/40"
                />
              )
            }

            const dayEvents = eventsByDay[day] ?? []
            const isToday = day === todayDay
            const dateStr = formatDate(day)
            const isClickable = isAdmin || dayEvents.length > 0
            // Cap visible bars at 3 - any more crowds a 60px-tall cell. The
            // remainder surfaces as "+N" so the day still indicates "lots
            // happening" at a glance.
            const visibleBars = dayEvents.slice(0, 3)
            const overflow = dayEvents.length - visibleBars.length

            return (
              <button
                key={day}
                type="button"
                onClick={() => isClickable && onDayClick?.(dateStr)}
                disabled={!isClickable}
                aria-label={`${day} - ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                className={[
                  'border-r border-b border-gray-200 min-h-[60px] px-1 pt-1 pb-1.5 flex flex-col items-stretch gap-1 bg-white text-left',
                  isClickable ? 'active:bg-gray-100 transition-colors' : 'cursor-default',
                ].join(' ')}
              >
                {/* Day number row - centered. Today gets a filled accent
                    circle; matches the desktop grid's today affordance. */}
                <div className="flex justify-center">
                  {isToday ? (
                    <span
                      className="rounded-full w-6 h-6 flex items-center justify-center text-[12px] font-bold text-white leading-none"
                      style={{ backgroundColor: theme.header }}
                    >
                      {day}
                    </span>
                  ) : (
                    <span className="font-sans text-[12px] font-medium text-gray-700 leading-none pt-1">
                      {day}
                    </span>
                  )}
                </div>

                {/* Event bars - thin and colored, no text. Title lives in
                    the day-events modal that opens on tap. */}
                {visibleBars.length > 0 && (
                  <div className="flex flex-col gap-[2px] mt-auto">
                    {visibleBars.map((e) => {
                      const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
                      return (
                        <div
                          key={e.id}
                          className="h-[3px] rounded-sm w-full"
                          style={{ backgroundColor: colors.dot }}
                        />
                      )
                    })}
                    {overflow > 0 && (
                      <span className="font-sans text-[9px] text-gray-500 leading-none mt-0.5">
                        +{overflow}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

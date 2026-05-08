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

        {/* Cells - borderless, Google-Calendar style. Whitespace alone
            separates the columns; users locate the right day visually
            from the day-of-week strip above. */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[78px]"
                />
              )
            }

            const dayEvents = eventsByDay[day] ?? []
            const isToday = day === todayDay
            const dateStr = formatDate(day)
            const isClickable = isAdmin || dayEvents.length > 0
            // Cap at 2 visible chips - more crowds a 49px-wide cell. Anything
            // past that surfaces as "+N" and the user taps to see the rest in
            // the day-events sheet. Truncation is aggressive but readable in
            // the church's low-volume context (most days have 0-1 events).
            const visibleEvents = dayEvents.slice(0, 2)
            const overflow = dayEvents.length - visibleEvents.length

            return (
              <button
                key={day}
                type="button"
                onClick={() => isClickable && onDayClick?.(dateStr)}
                disabled={!isClickable}
                aria-label={`${day} - ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                className={[
                  'min-h-[78px] px-0.5 pt-1 pb-1 flex flex-col items-stretch gap-1 bg-white text-left',
                  isClickable ? 'rounded active:bg-gray-100 transition-colors' : 'cursor-default',
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

                {/* Event chips - tiny version of the desktop chip. Same color
                    palette, same left-border accent, just text-[9px] and
                    truncated. The day-events sheet still opens on tap for
                    the full title + notes. */}
                {visibleEvents.length > 0 && (
                  <div className="flex flex-col gap-[2px] mt-auto min-w-0">
                    {visibleEvents.map((e) => {
                      const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
                      return (
                        <div
                          key={e.id}
                          className="rounded-[2px] px-1 py-[1px] font-display text-[9px] font-semibold leading-tight truncate"
                          style={{
                            backgroundColor: colors.bg,
                            borderLeft: `2px solid ${colors.dot}`,
                            color: colors.text,
                          }}
                        >
                          {e.title}
                        </div>
                      )
                    })}
                    {overflow > 0 && (
                      <span className="font-sans text-[9px] text-gray-500 leading-none mt-0.5 px-1">
                        +{overflow} more
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

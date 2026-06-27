'use client'

import { useMemo } from 'react'
import { CalendarEvent } from './types'
import EventChip from './EventChip'
import EventBanner from './EventBanner'

interface CalendarGridProps {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick?: (date: string) => void
  isAdmin?: boolean
  theme: { title: string; header: string; headerText: string }
}

const DAY_HEADERS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Desktop banner geometry. BANNER_TOP clears the absolute day number; each
// multi-day ribbon lane is LANE_HEIGHT tall. Cells reserve `laneCount *
// LANE_HEIGHT` of top padding so single-day chips never sit under a banner.
const BANNER_TOP = 24
const LANE_HEIGHT = 22

// An event renders as a banner ribbon when it has an explicit end_date. The end
// may equal the start (a deliberate one-day banner), so this is >=, not >.
function isSpanEvent(e: CalendarEvent): boolean {
  return !!e.end_date && e.end_date >= e.date
}

interface BannerSegment {
  event: CalendarEvent
  startCol: number // 0-6 within the week
  span: number     // number of columns covered
  lane: number
  roundStart: boolean
  roundEnd: boolean
}

interface Week {
  cells: (number | null)[]
  banners: BannerSegment[]
  laneCount: number
}

export default function CalendarGrid({
  year,
  month,
  events,
  onDayClick,
  isAdmin = false,
  theme,
}: CalendarGridProps) {
  const { cells, singleByDay, mobileByDay, weeks } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const firstDayOfWeek = firstDay.getDay()
    const daysInMonth = new Date(year, month, 0).getDate()

    // Clamp a span's start/end to this month's visible [1, daysInMonth]. The
    // overlap query can return an event that begins in a previous month or ends
    // in a later one; in the grid it should run from the month edge.
    const clampStart = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number)
      if (y < year || (y === year && m < month)) return 1
      return d
    }
    const clampEnd = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number)
      if (y > year || (y === year && m > month)) return daysInMonth
      return d
    }

    const single: CalendarEvent[] = []
    const multi: CalendarEvent[] = []
    for (const e of events) {
      if (isSpanEvent(e)) multi.push(e)
      else single.push(e)
    }

    // Single-day events keyed by day - the desktop chips and the base of the
    // mobile list.
    const singleByDay: Record<number, CalendarEvent[]> = {}
    const mobileByDay: Record<number, CalendarEvent[]> = {}
    for (const e of single) {
      const day = parseInt(e.date.split('-')[2], 10)
      ;(singleByDay[day] ??= []).push(e)
      ;(mobileByDay[day] ??= []).push(e)
    }
    // Mobile shows a multi-day event as a chip on each day it covers (no banner
    // layer on the dense mobile grid).
    for (const e of multi) {
      const s = clampStart(e.date)
      const en = clampEnd(e.end_date!)
      for (let d = s; d <= en; d++) (mobileByDay[d] ??= []).push(e)
    }

    // Greedy lane assignment so two overlapping spans never share a lane, and a
    // span keeps the same lane across the weeks it crosses (reads continuous).
    const spans = multi
      .map((e) => ({ e, start: clampStart(e.date), end: clampEnd(e.end_date!) }))
      .sort((a, b) => a.start - b.start || a.end - b.end)
    const laneEnds: number[] = []
    const laneOf = new Map<string, number>()
    for (const s of spans) {
      let lane = 0
      while (lane < laneEnds.length && laneEnds[lane] >= s.start) lane++
      laneEnds[lane] = s.end
      laneOf.set(s.e.id, lane)
    }

    // Leading blanks before day 1; trailing is left unpadded (the last week
    // just renders fewer cells, matching the previous layout).
    const cells: (number | null)[] = [
      ...Array(firstDayOfWeek).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]

    const numWeeks = Math.ceil(cells.length / 7)
    const weeks: Week[] = []
    for (let w = 0; w < numWeeks; w++) {
      const weekStartCell = w * 7
      const weekEndCell = w * 7 + 6
      const banners: BannerSegment[] = []
      for (const s of spans) {
        const sCell = firstDayOfWeek + s.start - 1
        const eCell = firstDayOfWeek + s.end - 1
        if (eCell < weekStartCell || sCell > weekEndCell) continue
        const segStart = Math.max(sCell, weekStartCell)
        const segEnd = Math.min(eCell, weekEndCell)
        banners.push({
          event: s.e,
          startCol: segStart - weekStartCell,
          span: segEnd - segStart + 1,
          lane: laneOf.get(s.e.id) ?? 0,
          roundStart: segStart === sCell,
          roundEnd: segEnd === eCell,
        })
      }
      const laneCount = banners.reduce((m, b) => Math.max(m, b.lane + 1), 0)
      weeks.push({ cells: cells.slice(weekStartCell, weekStartCell + 7), banners, laneCount })
    }

    return { cells, singleByDay, mobileByDay, weeks }
  }, [events, year, month])

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = isCurrentMonth ? today.getDate() : -1

  function formatDate(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <div className="w-full">
      {/* Desktop: full 7-col grid. Gated by container width (not viewport) so
          the export PNG - which forces the wrapper to 1100px regardless of
          device - always renders this editorial layout. Each week is its own
          relative row so multi-day banners can be absolutely positioned across
          its columns. */}
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

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} className="relative grid grid-cols-7">
            {week.cells.map((day, di) => {
              if (day === null) {
                return (
                  <div
                    key={`empty-${wi}-${di}`}
                    className={[
                      'border-t border-gray-900 min-h-[115px] bg-white',
                      di < 6 ? 'border-r border-gray-900' : '',
                    ].join(' ')}
                  />
                )
              }

              const chips = singleByDay[day] ?? []
              const isToday = day === todayDay
              const dateStr = formatDate(day)
              const isClickable = isAdmin || (mobileByDay[day]?.length ?? 0) > 0

              return (
                <div
                  key={day}
                  onClick={() => isClickable && onDayClick?.(dateStr)}
                  style={{ paddingTop: BANNER_TOP + week.laneCount * LANE_HEIGHT }}
                  className={[
                    'group relative border-t border-gray-900 bg-white min-h-[115px] px-1.5 pb-1.5 flex flex-col gap-1',
                    di < 6 ? 'border-r border-gray-900' : '',
                    isClickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : '',
                  ].join(' ')}
                >
                  {/* Date number - absolute top-right so it sits clear of the
                      banner lanes reserved by paddingTop. */}
                  <span
                    data-today-circle={isToday ? 'true' : undefined}
                    className={[
                      'absolute top-1.5 right-1.5 z-10 font-sans text-xs font-semibold leading-none',
                      isToday
                        ? 'rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white'
                        : 'text-gray-600',
                    ].join(' ')}
                    style={isToday ? { backgroundColor: theme.header } : {}}
                  >
                    {day}
                  </span>

                  {/* Single-day events - highlighter-swipe chips, shared with
                      the mobile grid and the PNG export. */}
                  {chips.map((e) => (
                    <EventChip
                      key={e.id}
                      title={e.title}
                      icon={e.icon}
                      color={e.color}
                      tooltip={e.notes ?? e.title}
                    />
                  ))}

                  {isAdmin && chips.length === 0 && (
                    <span className="font-sans text-[9px] text-gray-300 mt-auto opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                  )}
                </div>
              )
            })}

            {/* Multi-day banner ribbons for this week. pointer-events-none so a
                click falls through to the day cell underneath (which opens the
                day-events list including the span). */}
            {week.banners.map((b) => (
              <div
                key={`${b.event.id}-${wi}`}
                className="absolute pointer-events-none"
                style={{
                  left: `${(b.startCol / 7) * 100}%`,
                  width: `${(b.span / 7) * 100}%`,
                  top: BANNER_TOP + b.lane * LANE_HEIGHT,
                  height: LANE_HEIGHT - 3,
                }}
              >
                <EventBanner
                  title={b.event.title}
                  color={b.event.color}
                  roundStart={b.roundStart}
                  roundEnd={b.roundEnd}
                  tooltip={b.event.notes ?? b.event.title}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: compact 7-column month grid - Google Calendar pattern. Every
          day is visible; chips show truncated titles for the church's low-
          volume context (most days have 0-1 events). A multi-day event shows as
          a chip on each day it covers. Tap any day to open the day-events sheet
          for full title + notes. Container-gated so the export PNG never falls
          back to this view.

          Edge-to-edge: -mx-3 breaks the grid out of the export wrapper's p-3
          so cells use the full available width on mobile. */}
      <div className="block @3xl:hidden -mx-3">
        <div className="grid grid-cols-7 mb-1 border-b border-gray-100">
          {DAY_LETTERS.map((letter, i) => (
            <div
              key={i}
              className="text-center font-display text-[10px] font-bold uppercase tracking-[0.15em] py-2"
              style={{ color: theme.header }}
            >
              {letter}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="min-h-[92px]" />
            }

            const dayEvents = mobileByDay[day] ?? []
            const isToday = day === todayDay
            const dateStr = formatDate(day)
            const isClickable = isAdmin || dayEvents.length > 0
            const visibleEvents = dayEvents.slice(0, 3)
            const overflow = dayEvents.length - visibleEvents.length

            return (
              <button
                key={day}
                type="button"
                onClick={() => isClickable && onDayClick?.(dateStr)}
                disabled={!isClickable}
                aria-label={`${day} - ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                className={[
                  'min-h-[92px] py-1.5 flex flex-col items-stretch gap-1.5 bg-white text-left',
                  isClickable ? 'active:bg-gray-50 transition-colors' : 'cursor-default',
                ].join(' ')}
              >
                <div className="flex justify-center">
                  {isToday ? (
                    <span
                      className="rounded-full w-7 h-7 flex items-center justify-center text-[13px] font-bold text-white leading-none"
                      style={{ backgroundColor: theme.header }}
                    >
                      {day}
                    </span>
                  ) : (
                    <span className="font-sans text-[13px] font-medium text-gray-700 leading-none pt-1">
                      {day}
                    </span>
                  )}
                </div>

                {/* Compact EventChip variant: same highlighter tint as desktop
                    but smaller and icon-less so it fits the ~50px columns. */}
                {visibleEvents.length > 0 && (
                  <div className="flex flex-col gap-[3px] mt-auto min-w-0">
                    {visibleEvents.map((e) => (
                      <EventChip key={e.id} title={e.title} icon={e.icon} color={e.color} compact />
                    ))}
                    {overflow > 0 && (
                      <span className="font-sans text-[9px] text-gray-500 leading-none mx-0.5 mt-0.5">
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

'use client'

import { useMemo } from 'react'
import { CalendarEvent, COLOR_MAP } from './types'
import CalendarIcon from './CalendarIcon'

interface CalendarGridProps {
  year: number
  month: number // 1-indexed
  events: CalendarEvent[]
  onDayClick?: (date: string) => void // YYYY-MM-DD, only when admin
  isAdmin?: boolean
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarGrid({
  year,
  month,
  events,
  onDayClick,
  isAdmin = false,
}: CalendarGridProps) {
  const { firstDayOfWeek, daysInMonth } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    return { firstDayOfWeek: firstDay.getDay(), daysInMonth: lastDay.getDate() }
  }, [year, month])

  // Group events by day number for O(1) lookup in render
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

  // Build a flat array of cells: null = empty leading day
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function formatDate(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <div className="w-full">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-semibold tracking-widest uppercase text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Thin rule under headers */}
      <div className="border-t border-border mb-0" />

      {/* Calendar cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <div
                key={`empty-${idx}`}
                className="border-b border-border min-h-[100px] px-1 py-1"
              />
            )
          }

          const dayEvents = eventsByDay[day] ?? []
          const isToday = day === todayDay
          const dateStr = formatDate(day)

          return (
            <div
              key={day}
              onClick={() => isAdmin && onDayClick?.(dateStr)}
              className={[
                'border-b border-border min-h-[100px] px-2 py-2 flex flex-col gap-1',
                'transition-colors duration-100',
                isAdmin ? 'cursor-pointer hover:bg-accent/5' : '',
                // right border for all but last column
                (idx % 7) < 6 ? 'border-r border-border/40' : '',
              ].join(' ')}
            >
              {/* Date number */}
              <span
                className={[
                  'text-sm font-medium leading-none mb-1 self-start',
                  isToday
                    ? 'bg-foreground text-background rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold'
                    : 'text-muted',
                ].join(' ')}
              >
                {day}
              </span>

              {/* Events */}
              {dayEvents.map((e) => {
                const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-1 min-w-0"
                    title={e.notes ?? e.title}
                  >
                    <span
                      className="shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: colors.dot }}
                    />
                    <CalendarIcon iconKey={e.icon} size={11} color={colors.text} />
                    <span
                      className="text-[11px] font-medium leading-tight truncate"
                      style={{ color: colors.text }}
                    >
                      {e.title}
                    </span>
                  </div>
                )
              })}

              {/* Admin hint when no events */}
              {isAdmin && dayEvents.length === 0 && (
                <span className="text-[10px] text-border mt-auto hidden group-hover:block">
                  + add
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

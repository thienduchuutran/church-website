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

  return (
    <div className="w-full border-2 border-gray-900 overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={d}
            className={[
              'py-2.5 text-center text-sm font-bold',
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
              {/* Date number — top right */}
              <span
                className={[
                  'text-xs font-semibold self-end leading-none mb-0.5',
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
                    className="flex items-center gap-1 min-w-0 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight"
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
                <span className="text-[9px] text-gray-300 mt-auto">+</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { CalendarEvent, CalendarMonthNote, COLOR_MAP } from './types'
import CalendarIcon from './CalendarIcon'

interface CalendarSidebarProps {
  events: CalendarEvent[]
  monthNote: CalendarMonthNote | null
  monthName: string
  year: number
  isAdmin?: boolean
  onEditNote?: () => void
}

export default function CalendarSidebar({
  events,
  monthNote,
  monthName,
  year,
  isAdmin = false,
  onEditNote,
}: CalendarSidebarProps) {
  const birthdays = events.filter((e) => e.event_type === 'birthday')
  const bibleStudyDays = events.filter((e) => e.event_type === 'bible_study')

  return (
    <aside className="flex flex-col gap-8 pl-8 border-l border-border">

      {/* Month note — pull-quote style */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted">
            {monthName} {year}
          </p>
          {isAdmin && (
            <button
              onClick={onEditNote}
              className="text-[10px] text-muted hover:text-foreground transition-colors underline underline-offset-2"
            >
              {monthNote ? 'Edit note' : 'Add note'}
            </button>
          )}
        </div>

        {monthNote?.content ? (
          <blockquote className="relative">
            {/* Decorative rule */}
            <span
              className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
              style={{ background: 'var(--accent)' }}
            />
            <p className="pl-4 text-base leading-relaxed font-serif text-foreground whitespace-pre-wrap">
              {monthNote.content}
            </p>
          </blockquote>
        ) : (
          <p className="text-sm text-border italic">
            {isAdmin ? 'Click "Add note" to write a monthly note.' : 'No announcements this month.'}
          </p>
        )}
      </div>

      {/* Birthdays */}
      {birthdays.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-3">
            Birthdays
          </p>
          <ul className="flex flex-col gap-2">
            {birthdays.map((e) => {
              const colors = COLOR_MAP[e.color] ?? COLOR_MAP.rose
              const day = parseInt(e.date.split('-')[2], 10)
              return (
                <li key={e.id} className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <CalendarIcon iconKey="cake" size={11} color={colors.dot} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight truncate">
                      {e.title}
                    </p>
                    <p className="text-[11px] text-muted">
                      {monthName} {day}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Bible study schedule */}
      {bibleStudyDays.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-3">
            Bible Study
          </p>
          <ul className="flex flex-col gap-1.5">
            {bibleStudyDays.map((e) => {
              const day = parseInt(e.date.split('-')[2], 10)
              const colors = COLOR_MAP[e.color] ?? COLOR_MAP.sky
              return (
                <li key={e.id} className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: colors.dot }}
                  />
                  <span className="text-sm text-foreground">
                    {e.title}
                    <span className="text-muted text-[11px] ml-1">— {monthName} {day}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Divider + legend */}
      <div className="mt-auto pt-4 border-t border-border/50">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-2">
          Key
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            { color: 'rose',    label: 'Birthday' },
            { color: 'sky',     label: 'Bible Study' },
            { color: 'violet',  label: 'Prayer' },
            { color: 'amber',   label: 'Announcement' },
            { color: 'slate',   label: 'General' },
          ].map(({ color, label }) => {
            const c = COLOR_MAP[color]
            return (
              <div key={color} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                <span className="text-[11px] text-muted">{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

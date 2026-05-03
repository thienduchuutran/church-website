'use client'

import { X, Plus, PencilSimple } from '@phosphor-icons/react'
import { CalendarEvent, COLOR_MAP, EVENT_TYPE_LABELS } from './types'
import CalendarIcon from './CalendarIcon'

interface DayEventsModalProps {
  date: string                    // YYYY-MM-DD
  events: CalendarEvent[]
  isAdmin: boolean
  onEdit: (event: CalendarEvent) => void
  onAddNew: () => void
  onClose: () => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })
  return `${weekday}, ${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

export default function DayEventsModal({
  date,
  events,
  isAdmin,
  onEdit,
  onAddNew,
  onClose,
}: DayEventsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </p>
            <h2 className="font-serif text-xl font-bold text-foreground mt-0.5">
              {formatDate(date)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-border/40 transition-colors text-muted"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Events list */}
        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-2">
          {events.map((e) => {
            const colors = COLOR_MAP[e.color] ?? COLOR_MAP.slate
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 px-3 py-3 rounded-xl border border-border hover:border-foreground/20 transition-colors"
                style={{ backgroundColor: colors.bg }}
              >
                {/* Icon */}
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  <CalendarIcon iconKey={e.icon} size={16} color={colors.dot} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight" style={{ color: colors.text }}>
                    {e.title}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                  </p>
                  {e.notes && (
                    <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed whitespace-pre-wrap">
                      {e.notes}
                    </p>
                  )}
                </div>

                {/* Edit button — admin only */}
                {isAdmin && (
                  <button
                    onClick={() => onEdit(e)}
                    className="shrink-0 p-1.5 rounded-md text-muted hover:text-foreground hover:bg-white/60 transition-colors"
                    title="Edit"
                  >
                    <PencilSimple size={14} weight="bold" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted hover:text-foreground border border-border hover:border-foreground/30 transition-colors"
          >
            Close
          </button>
          {isAdmin && (
            <button
              onClick={onAddNew}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-foreground text-background hover:opacity-80 transition-opacity flex items-center gap-1.5"
            >
              <Plus size={14} weight="bold" />
              Add another
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

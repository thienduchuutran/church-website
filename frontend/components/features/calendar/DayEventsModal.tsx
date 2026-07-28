'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, PencilSimple } from '@phosphor-icons/react'
import { CalendarEvent, CalendarEventTypeDef, eventTypeLabel, resolveColor } from './types'
import { getEventTypes } from '@/lib/calendar'
import CalendarIcon from './CalendarIcon'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'

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

const EXIT_MS = 280

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
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Needed so an admin-created category shows its label ("Baptism") instead of
  // its raw slug. eventTypeLabel de-slugs as a last resort, so a failed fetch
  // degrades to "Fellowship Meal" rather than "fellowship_meal".
  const [eventTypes, setEventTypes] = useState<CalendarEventTypeDef[]>([])

  useEffect(() => {
    setMounted(true)
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getEventTypes()
      .then((types) => {
        if (!cancelled) setEventTypes(types)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(onClose, EXIT_MS)
  }, [closing, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  if (!mounted) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[10px] backdrop-saturate-150 ${closing ? 'apple-backdrop-out' : 'apple-backdrop-in'}`}
      onClick={handleClose}
    >
      <div
        className={`relative w-full sm:max-w-md bg-surface rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45),0_10px_30px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[90dvh] will-change-transform ${closing ? 'apple-sheet-out' : 'apple-sheet-in'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <p className="font-display text-[10px] font-semibold tracking-widest uppercase text-muted">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </p>
            <h2 className="font-serif text-xl font-bold text-foreground mt-0.5">
              {formatDate(date)}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-border/40 transition-colors text-muted"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Events list */}
        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-2">
          {events.map((e) => {
            const colors = resolveColor(e.color)
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 px-3 py-3 rounded-xl border border-border hover:border-foreground/20 transition-colors"
                style={{ backgroundColor: colors.bg }}
              >
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  <CalendarIcon iconKey={e.icon} size={16} color={colors.dot} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold leading-tight" style={{ color: colors.text }}>
                    {e.title}
                  </p>
                  <p className="font-display text-[11px] text-muted mt-0.5">
                    {eventTypeLabel(e.event_type, eventTypes)}
                  </p>
                  {e.notes && (
                    <p className="font-sans text-xs text-foreground/80 mt-1.5 leading-relaxed whitespace-pre-wrap">
                      {e.notes}
                    </p>
                  )}
                  {/*
                    Per-event translation notice. Sits inside the same column
                    as the title/notes so it's clearly associated with this
                    event, not the modal as a whole.
                  */}
                  {e.machine_translated && (
                    <div className="mt-1.5">
                      <MachineTranslatedBadge />
                    </div>
                  )}
                </div>

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
            onClick={handleClose}
            className="px-4 py-2 rounded-lg font-display text-sm text-muted hover:text-foreground border border-border hover:border-foreground/30 transition-colors"
          >
            Close
          </button>
          {isAdmin && (
            <button
              onClick={onAddNew}
              className="px-4 py-2 rounded-lg font-display text-sm font-semibold bg-foreground text-background hover:opacity-80 transition-opacity flex items-center gap-1.5"
            >
              <Plus size={14} weight="bold" />
              Add another
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

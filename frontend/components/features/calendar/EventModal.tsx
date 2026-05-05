'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { createEvent, deleteEvent, updateEvent, upsertMonthNote } from '@/lib/calendar'
import {
  CalendarEvent,
  CalendarEventType,
  CalendarMonthNote,
  COLOR_MAP,
  EVENT_TYPE_LABELS,
  ICON_LABELS,
} from './types'
import CalendarIcon from './CalendarIcon'

type ModalMode = 'create' | 'edit' | 'note'

interface EventModalProps {
  mode: ModalMode
  date: string | null        // YYYY-MM-DD, for create
  event: CalendarEvent | null // for edit
  monthNote: CalendarMonthNote | null
  year: number
  month: number
  accessToken: string | null
  onSaved: () => void
  onClose: () => void
}

const ICON_KEYS = Object.keys(ICON_LABELS)
const COLOR_KEYS = Object.keys(COLOR_MAP)
const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as CalendarEventType[]

const EXIT_MS = 280

export default function EventModal({
  mode,
  date,
  event,
  monthNote,
  year,
  month,
  accessToken,
  onSaved,
  onClose,
}: EventModalProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [eventType, setEventType] = useState<CalendarEventType>(event?.event_type ?? 'general')
  const [icon, setIcon] = useState(event?.icon ?? 'star')
  const [color, setColor] = useState(event?.color ?? 'slate')
  const [privateAddress, setPrivateAddress] = useState(event?.private_address ?? '')
  const [showAddress, setShowAddress] = useState(!!event?.private_address)
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [noteContent, setNoteContent] = useState(monthNote?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Portal + animation state - mirrors EditPostModal's pattern.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    ;(firstInputRef.current as HTMLElement)?.focus()
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  // Run the exit animation, then unmount via the parent's onClose.
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

  // Sync icon/color with event type selection for smart defaults
  function handleTypeChange(t: CalendarEventType) {
    setEventType(t)
    const defaults: Record<CalendarEventType, { icon: string; color: string }> = {
      birthday: { icon: 'cake', color: 'rose' },
      bible_study: { icon: 'book-open', color: 'sky' },
      prayer: { icon: 'flame', color: 'violet' },
      announcement: { icon: 'bell', color: 'amber' },
      general: { icon: 'star', color: 'slate' },
    }
    setIcon(defaults[t].icon)
    setColor(defaults[t].color)
  }

  async function handleSave() {
    if (!accessToken) return
    setSaving(true)
    setError(null)
    try {
      if (mode === 'note') {
        await upsertMonthNote(year, month, noteContent, accessToken)
      } else if (mode === 'create' && date) {
        await createEvent({ date, title, event_type: eventType, icon, color, private_address: showAddress ? (privateAddress || null) : null, notes: notes || null }, accessToken)
      } else if (mode === 'edit' && event) {
        await updateEvent(event.id, { title, event_type: eventType, icon, color, private_address: showAddress ? (privateAddress || null) : null, notes: notes || null }, accessToken)
      }
      onSaved()
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!accessToken || !event) return
    setSaving(true)
    try {
      await deleteEvent(event.id, accessToken)
      onSaved()
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setSaving(false)
    }
  }

  const canSave = mode === 'note'
    ? true
    : title.trim().length > 0

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
              {mode === 'note' ? 'Monthly Note' : mode === 'edit' ? 'Edit Event' : 'New Event'}
            </p>
            <h2 className="font-serif text-xl font-bold text-foreground mt-0.5">
              {mode === 'note'
                ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`
                : date ?? event?.date ?? ''}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-border/40 transition-colors text-muted"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

          {mode === 'note' ? (
            <div className="flex flex-col gap-2">
              <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                Sidebar note
              </label>
              <textarea
                ref={firstInputRef as React.RefObject<HTMLTextAreaElement>}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={6}
                placeholder="Write a monthly note, address, theme verse…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          ) : (
            <>
              {/* Title */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Title
                </label>
                <input
                  ref={firstInputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Event or person's name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              {/* Event type */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTypeChange(t)}
                      className={[
                        'px-3 py-1.5 rounded-full font-display text-xs font-medium border transition-colors',
                        eventType === t
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-muted border-border hover:border-foreground/30',
                      ].join(' ')}
                    >
                      {EVENT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon picker */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_KEYS.map((key) => {
                    const colors = COLOR_MAP[color] ?? COLOR_MAP.slate
                    const active = icon === key
                    return (
                      <button
                        key={key}
                        onClick={() => setIcon(key)}
                        title={ICON_LABELS[key]}
                        className={[
                          'w-9 h-9 rounded-lg flex items-center justify-center border transition-all',
                          active
                            ? 'border-foreground shadow-sm'
                            : 'border-border hover:border-foreground/30',
                        ].join(' ')}
                        style={active ? { backgroundColor: colors.bg } : {}}
                      >
                        <CalendarIcon iconKey={key} size={16} color={active ? colors.dot : undefined} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color picker */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_KEYS.map((key) => {
                    const c = COLOR_MAP[key]
                    return (
                      <button
                        key={key}
                        onClick={() => setColor(key)}
                        title={key}
                        className={[
                          'w-7 h-7 rounded-full border-2 transition-all',
                          color === key ? 'scale-110 border-foreground' : 'border-transparent hover:border-foreground/30',
                        ].join(' ')}
                        style={{ backgroundColor: c.dot }}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Location address - toggle reveals textarea, available for all event types */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                    Location address{' '}
                    <span className="normal-case font-normal">- private, admin only</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddress(v => !v)}
                    role="switch"
                    aria-checked={showAddress}
                    className={[
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40',
                      showAddress ? 'bg-foreground' : 'bg-border',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                        showAddress ? 'translate-x-4' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </button>
                </div>
                {showAddress && (
                  <textarea
                    value={privateAddress}
                    onChange={(e) => setPrivateAddress(e.target.value)}
                    rows={2}
                    placeholder="123 Street, City"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                )}
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Notes <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Extra details shown on hover"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </>
          )}

          {error && (
            <p className="font-sans text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-border flex items-center justify-between gap-3">
          {mode === 'edit' && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="font-display text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              Delete
            </button>
          )}
          {mode === 'edit' && confirmDelete && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="font-display text-sm text-red-500 font-semibold hover:text-red-700 transition-colors"
            >
              {saving ? 'Deleting…' : 'Confirm delete'}
            </button>
          )}
          {mode !== 'edit' && <div />}

          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg font-display text-sm text-muted hover:text-foreground border border-border hover:border-foreground/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="px-5 py-2 rounded-lg font-display text-sm font-semibold bg-foreground text-background hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

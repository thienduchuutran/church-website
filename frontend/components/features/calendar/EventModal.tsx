'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Check, Plus, Prohibit, X } from '@phosphor-icons/react'
import {
  createEvent,
  createEventType,
  createPaletteColor,
  deleteEvent,
  deletePaletteColor,
  getEventTypes,
  getPaletteColors,
  updateEvent,
  upsertMonthNote,
} from '@/lib/calendar'
import {
  CalendarEvent,
  CalendarEventType,
  CalendarEventTypeDef,
  CalendarMonthNote,
  COLOR_MAP,
  EVENT_TYPE_LABELS,
  ICON_LABELS,
  ICON_NONE,
  PaletteColor,
  resolveColor,
} from './types'
import CalendarIcon from './CalendarIcon'
import CustomColorPopover from './CustomColorPopover'
import InfoTip from '@/components/ui/InfoTip'

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

// ICON_LABELS leads with ICON_NONE, so the "None" tile is naturally the first
// cell in the grid - the convention Notion and Asana use, where "no icon" is a
// selectable state in the radio group rather than a separate clear button.
const ICON_KEYS = Object.keys(ICON_LABELS)
const COLOR_KEYS = Object.keys(COLOR_MAP)

// Used only until GET /calendar/event-types resolves, so the chip row renders
// its real labels immediately instead of flashing empty.
const FALLBACK_TYPE_SLUGS = Object.keys(EVENT_TYPE_LABELS)

// The icon/color a built-in type starts with. The database now carries these
// per type (calendar_event_types.default_icon/default_color); this map is the
// pre-fetch fallback only.
const FALLBACK_TYPE_DEFAULTS: Record<string, { icon: string; color: string }> = {
  birthday: { icon: 'cake', color: 'rose' },
  bible_study: { icon: 'book-open', color: 'sky' },
  prayer: { icon: 'flame', color: 'violet' },
  announcement: { icon: 'bell', color: 'amber' },
  general: { icon: 'star', color: 'slate' },
  graduation: { icon: 'graduation-cap', color: 'amber' },
}

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
  // Whether the address is shown on the public website (the export always shows
  // it). Defaults to private; admin opts each address in.
  const [addressPublic, setAddressPublic] = useState(event?.address_public ?? false)
  const [notes, setNotes] = useState(event?.notes ?? '')
  // Multi-day span. startDate is the event's day (fixed); a span exists only
  // when an end date past the start is set. Initialized from the loaded event.
  const startDate = date ?? event?.date ?? ''
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [multiDay, setMultiDay] = useState(!!event?.end_date)
  const [noteContent, setNoteContent] = useState(monthNote?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The two admin-growable vocabularies, fetched on open. Both start empty and
  // fall back to the built-ins, so the modal is fully usable even if these
  // requests fail.
  const [eventTypes, setEventTypes] = useState<CalendarEventTypeDef[]>([])
  const [palette, setPalette] = useState<PaletteColor[]>([])

  // Inline "create a type as you type" state (the Linear/Airtable pattern).
  const [addingType, setAddingType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [creatingType, setCreatingType] = useState(false)
  const newTypeInputRef = useRef<HTMLInputElement | null>(null)

  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  // GoodNotes' "Edit" mode for the swatch grid: a toggle rather than hover, so
  // removing a saved color works on a phone as well as a desktop.
  const [editingPalette, setEditingPalette] = useState(false)

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

  // Load the admin-growable vocabularies. Failures are swallowed on purpose:
  // the picker falls back to the built-in chips and swatches, so a flaky
  // network degrades the flexibility rather than blocking event creation.
  useEffect(() => {
    let cancelled = false
    Promise.all([getEventTypes(), getPaletteColors()])
      .then(([types, colors]) => {
        if (cancelled) return
        setEventTypes(types)
        setPalette(colors)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Sync icon/color with event type selection for smart defaults. The defaults
  // now travel with the type row in the database, so an admin-created type
  // brings its own look; FALLBACK_TYPE_DEFAULTS only covers the window before
  // the fetch lands.
  function handleTypeChange(t: CalendarEventType) {
    setEventType(t)
    const def = eventTypes.find((d) => d.slug === t)
    const defaults = def
      ? { icon: def.default_icon, color: def.default_color }
      : FALLBACK_TYPE_DEFAULTS[t]
    if (defaults) {
      setIcon(defaults.icon)
      setColor(defaults.color)
    }
  }

  // Create a reusable type from what the admin typed. The new type inherits the
  // icon and color currently selected, so it is born looking like the event
  // being built rather than generic. The slug is derived server-side, which
  // makes this get-or-create - two admins typing "Baptism" converge on one type.
  async function handleCreateType() {
    const label = newTypeLabel.trim()
    if (!label || !accessToken) return
    setCreatingType(true)
    setError(null)
    try {
      const def = await createEventType(
        { label, default_icon: icon, default_color: color },
        accessToken,
      )
      setEventTypes((prev) => (prev.some((t) => t.slug === def.slug) ? prev : [...prev, def]))
      setEventType(def.slug)
      setAddingType(false)
      setNewTypeLabel('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't create that type")
    } finally {
      setCreatingType(false)
    }
  }

  async function handleSavePaletteColor(hex: string) {
    if (!accessToken) throw new Error('Not signed in')
    const saved = await createPaletteColor(hex, accessToken)
    setPalette((prev) => (prev.some((c) => c.hex === saved.hex) ? prev : [...prev, saved]))
    setColor(saved.hex)
  }

  // Removing a swatch only shrinks the picker. Events already using that hex
  // keep it, because the color is copied onto the event rather than referenced.
  async function handleDeletePaletteColor(id: string) {
    if (!accessToken) return
    const previous = palette
    setPalette((prev) => prev.filter((c) => c.id !== id))
    try {
      await deletePaletteColor(id, accessToken)
    } catch {
      setPalette(previous)
      setError("Couldn't remove that color")
    }
  }

  async function handleSave() {
    if (!accessToken) return
    setSaving(true)
    setError(null)
    try {
      // Store a span whenever the multi-day toggle is on with an end date (it
      // may equal the start for a one-day banner). Otherwise send null, which
      // clears any existing span. The end-date picker's min keeps it >= start.
      const computedEndDate = multiDay && endDate ? endDate : null
      if (mode === 'note') {
        await upsertMonthNote(year, month, noteContent, accessToken)
      } else if (mode === 'create' && date) {
        await createEvent({ date, end_date: computedEndDate, title, event_type: eventType, icon, color, private_address: showAddress ? (privateAddress || null) : null, address_public: showAddress ? addressPublic : false, notes: notes || null }, accessToken)
      } else if (mode === 'edit' && event) {
        await updateEvent(event.id, { title, event_type: eventType, icon, color, private_address: showAddress ? (privateAddress || null) : null, address_public: showAddress ? addressPublic : false, notes: notes || null, end_date: computedEndDate }, accessToken)
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

  // The chip row: the fetched vocabulary once it lands, the built-ins before
  // then. The event's own type is appended if it is somehow missing from the
  // list, so editing an old event never silently reassigns its category.
  const typeChips: { slug: string; label: string }[] = (
    eventTypes.length > 0
      ? eventTypes.map((t) => ({ slug: t.slug, label: t.label }))
      : FALLBACK_TYPE_SLUGS.map((slug) => ({ slug, label: EVENT_TYPE_LABELS[slug] }))
  )
  if (eventType && !typeChips.some((c) => c.slug === eventType)) {
    typeChips.push({ slug: eventType, label: EVENT_TYPE_LABELS[eventType] ?? eventType })
  }

  // Built-in swatches first, then whatever admins have saved - the order the
  // GoodNotes palette grows in.
  const swatches: { key: string; hex: string; paletteId?: string }[] = [
    ...COLOR_KEYS.map((key) => ({ key, hex: COLOR_MAP[key].dot })),
    ...palette.map((c) => ({ key: c.hex, hex: c.hex, paletteId: c.id })),
  ]
  // An event may carry a custom hex that has since been removed from the shared
  // palette. Show it anyway, or the picker would look like nothing is selected.
  if (color.startsWith('#') && !swatches.some((s) => s.key.toUpperCase() === color.toUpperCase())) {
    swatches.push({ key: color, hex: color })
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
                <div className="flex flex-wrap items-center gap-2">
                  {typeChips.map(({ slug, label }) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => handleTypeChange(slug)}
                      className={[
                        'px-3 py-1.5 rounded-full font-display text-xs font-medium border transition-colors',
                        eventType === slug
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-muted border-border hover:border-foreground/30',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Create a type inline, without leaving the form - the
                      Linear/Airtable creatable-combobox pattern. */}
                  {addingType ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        ref={newTypeInputRef}
                        type="text"
                        value={newTypeLabel}
                        onChange={(e) => setNewTypeLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateType()
                          } else if (e.key === 'Escape') {
                            // Stop the modal's own Escape handler - the first
                            // press should cancel this input, not close the form.
                            e.stopPropagation()
                            setAddingType(false)
                            setNewTypeLabel('')
                          }
                        }}
                        maxLength={60}
                        placeholder="Baptism"
                        aria-label="New event type name"
                        className="w-28 rounded-full border border-foreground bg-background px-3 py-1.5 font-display text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <button
                        type="button"
                        onClick={handleCreateType}
                        disabled={creatingType || !newTypeLabel.trim()}
                        aria-label="Create event type"
                        className="p-1.5 rounded-full text-foreground hover:bg-border/40 transition-colors disabled:opacity-30"
                      >
                        <Check size={14} weight="bold" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingType(true)
                        // Focus after the input actually exists.
                        setTimeout(() => newTypeInputRef.current?.focus(), 0)
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-display text-xs font-medium border border-dashed border-border text-muted hover:border-foreground/40 hover:text-foreground transition-colors"
                    >
                      <Plus size={12} weight="bold" />
                      Add
                    </button>
                  )}
                </div>
                {addingType && (
                  <p className="font-sans text-[11px] text-muted">
                    New types are saved for everyone and start with the icon and color selected below.
                  </p>
                )}
              </div>

              {/* Dates - optional multi-day span. The start date is the event's
                  day (shown in the header); the toggle reveals an end-date
                  picker whose min is capped at the start so a span can't end
                  before it begins. */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                    Multi-day event
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setMultiDay((v) => {
                        const next = !v
                        if (next && !endDate) setEndDate(startDate)
                        return next
                      })
                    }
                    role="switch"
                    aria-checked={multiDay}
                    className={[
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40',
                      multiDay ? 'bg-foreground' : 'bg-border',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                        multiDay ? 'translate-x-4' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </button>
                </div>
                {multiDay && (
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs text-muted shrink-0">Ends on</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                )}
              </div>

              {/* Icon picker */}
              <div className="flex flex-col gap-2">
                <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_KEYS.map((key) => {
                    const colors = resolveColor(color)
                    const active = icon === key
                    const isNone = key === ICON_NONE
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setIcon(key)}
                        title={ICON_LABELS[key]}
                        aria-label={ICON_LABELS[key]}
                        aria-pressed={active}
                        className={[
                          'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                          // The None tile is dashed so it reads as an empty slot
                          // rather than another icon to choose between.
                          isNone ? 'border border-dashed' : 'border',
                          active
                            ? 'border-foreground shadow-sm'
                            : 'border-border hover:border-foreground/30',
                        ].join(' ')}
                        style={active ? { backgroundColor: colors.bg } : {}}
                      >
                        {isNone ? (
                          <Prohibit
                            size={16}
                            weight="bold"
                            color={active ? colors.text : 'currentColor'}
                            className={active ? undefined : 'text-muted'}
                          />
                        ) : (
                          <CalendarIcon iconKey={key} size={16} color={active ? colors.text : undefined} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color picker - built-in swatches, then the shared custom
                  palette, then a + that opens the full picker. The GoodNotes
                  model: the + both applies a color and can grow the grid. */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                    Color
                  </label>
                  {palette.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditingPalette((v) => !v)}
                      className="font-display text-[11px] font-medium text-muted hover:text-foreground transition-colors"
                    >
                      {editingPalette ? 'Done' : 'Edit'}
                    </button>
                  )}
                </div>
                <div className="relative flex flex-wrap items-center gap-2">
                  {swatches.map(({ key, hex, paletteId }) => {
                    const active = color.toUpperCase() === key.toUpperCase()
                    const removable = editingPalette && !!paletteId
                    return (
                      <span key={key} className="relative inline-flex">
                        <button
                          type="button"
                          onClick={() => setColor(key)}
                          title={key}
                          aria-label={`Color ${key}`}
                          aria-pressed={active}
                          className={[
                            'w-7 h-7 rounded-full border-2 transition-all',
                            active ? 'scale-110 border-foreground' : 'border-transparent hover:border-foreground/30',
                          ].join(' ')}
                          style={{ backgroundColor: hex }}
                        />
                        {removable && (
                          <button
                            type="button"
                            onClick={() => handleDeletePaletteColor(paletteId)}
                            aria-label={`Remove ${key} from the palette`}
                            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
                          >
                            <X size={9} weight="bold" />
                          </button>
                        )}
                      </span>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => setColorPickerOpen((v) => !v)}
                    aria-label="Add a custom color"
                    aria-expanded={colorPickerOpen}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
                  >
                    <Plus size={13} weight="bold" />
                  </button>

                  {colorPickerOpen && (
                    <CustomColorPopover
                      initial={color}
                      onApply={setColor}
                      onSaveToPalette={handleSavePaletteColor}
                      onClose={() => setColorPickerOpen(false)}
                    />
                  )}
                </div>
              </div>

              {/* Location address - toggle reveals textarea, available for all event types */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                    Location address
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
                  <>
                    <textarea
                      value={privateAddress}
                      onChange={(e) => setPrivateAddress(e.target.value)}
                      rows={2}
                      placeholder="123 Street, City"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-wider uppercase text-muted">
                        Show on website
                        <InfoTip label="About address visibility">
                          <p className="font-sans text-xs leading-relaxed text-muted">
                            <strong className="font-semibold text-foreground">Show on website</strong> only controls whether this address appears on the public calendar.
                          </p>
                          <p className="mt-1.5 font-sans text-xs leading-relaxed text-muted">
                            The exported image for Discord <strong className="font-semibold text-foreground">always</strong> includes it, no matter this setting.
                          </p>
                        </InfoTip>
                      </span>
                      <button
                        type="button"
                        onClick={() => setAddressPublic(v => !v)}
                        role="switch"
                        aria-checked={addressPublic}
                        className={[
                          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40',
                          addressPublic ? 'bg-foreground' : 'bg-border',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                            addressPublic ? 'translate-x-4' : 'translate-x-0',
                          ].join(' ')}
                        />
                      </button>
                    </div>
                  </>
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

'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Plus } from '@phosphor-icons/react'
import { deriveRamp, isHexColor, normalizeHexInput } from '@/lib/color'

interface CustomColorPopoverProps {
  // Where the picker starts - the event's current color when it is already a
  // hex, otherwise a neutral seed.
  initial: string
  // Use this color on the event without saving it to the shared palette.
  onApply: (hex: string) => void
  // Use it AND save it as a swatch every admin will see from now on.
  onSaveToPalette: (hex: string) => Promise<void>
  onClose: () => void
}

const SEED = '#2E7D9A'

// The "Custom" half of the GoodNotes color model: the preset grid handles the
// common case, and this handles "I want our exact Christmas red." Two commit
// paths, because they are genuinely different intents - using a color once
// should not silently grow a palette everyone else has to look at.
//
// The live preview shows BOTH renderers on purpose. A single-day chip paints
// text on the highlight tint while a multi-day banner paints white on the text
// color, so a color can look fine in one and poor in the other. Showing both is
// what stops an admin from saving something unreadable.
export default function CustomColorPopover({
  initial,
  onApply,
  onSaveToPalette,
  onClose,
}: CustomColorPopoverProps) {
  const start = isHexColor(initial) ? initial.toUpperCase() : SEED
  const [hex, setHex] = useState(start)
  // Kept separate from `hex` so half-typed input ("#2E7") does not repaint the
  // preview with a fallback color on every keystroke.
  const [hexText, setHexText] = useState(start)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also close the event modal behind us
        onClose()
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  function applyHexText(raw: string) {
    setHexText(raw)
    const normalized = normalizeHexInput(raw)
    if (normalized) {
      setHex(normalized)
      setError(null)
    }
  }

  async function handleSaveToPalette() {
    setSaving(true)
    setError(null)
    try {
      await onSaveToPalette(hex)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save the color")
      setSaving(false)
    }
  }

  const ramp = deriveRamp(hex)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Custom color"
      className="absolute top-full left-0 mt-2 z-30 w-[248px] max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-surface p-3"
      style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.16)' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="font-display text-[11px] font-semibold tracking-wider uppercase text-muted mb-2.5">
        Custom color
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const v = e.target.value.toUpperCase()
            setHex(v)
            setHexText(v)
            setError(null)
          }}
          aria-label="Pick a color"
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-0.5"
        />
        <input
          type="text"
          value={hexText}
          onChange={(e) => applyHexText(e.target.value)}
          onBlur={() => setHexText(hex)}
          spellCheck={false}
          aria-label="Hex color code"
          placeholder="#2E7D9A"
          className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-xs uppercase text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {/* Live preview - both the ways the calendar paints this color. */}
      <div className="mb-3 flex flex-col gap-1.5 rounded-lg bg-background p-2">
        <div
          className="flex items-center justify-center rounded-[4px] px-1.5 py-[3px] font-display text-[11px] font-bold leading-tight"
          style={{ backgroundColor: ramp.highlight, color: ramp.text }}
        >
          Single day
        </div>
        <div
          className="flex h-[18px] items-center justify-center rounded-[5px] px-2 font-display text-[11px] font-bold leading-none text-white"
          style={{ backgroundColor: ramp.text }}
        >
          Multi-day
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-2 font-sans text-[11px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            onApply(hex)
            onClose()
          }}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 font-display text-xs font-semibold text-background transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          <Check size={13} weight="bold" />
          Use this color
        </button>
        <button
          type="button"
          onClick={handleSaveToPalette}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 font-display text-xs font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
        >
          <Plus size={13} weight="bold" />
          {saving ? 'Saving…' : 'Save to palette'}
        </button>
      </div>
      <p className="mt-2 font-sans text-[10px] leading-snug text-muted">
        Saved colors appear here for every admin.
      </p>
    </div>
  )
}

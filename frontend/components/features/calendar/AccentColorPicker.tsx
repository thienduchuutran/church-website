'use client'

import { useEffect, useRef, useState } from 'react'
import { ACCENT_PRESETS } from './types'

interface AccentColorPickerProps {
  monthLabel: string                       // e.g. "May 2026" - shown in the popover title
  currentAccent: string                    // saved (or default) accent - used to revert previews
  onPreview: (hex: string) => void         // live-updates the calendar header before save
  onSave: (hex: string) => Promise<void>   // persist; resolves on success, rejects on error
  onClose: () => void
  saving: boolean
}

// Anchored popover (not portaled) - parent must give it `position: relative`.
// Render lives next to the trigger so layout shifts and focus stay local. We
// intentionally hand-roll the outside-click + escape handlers instead of
// pulling a popover lib, to match the rest of the calendar's small primitives.
export default function AccentColorPicker({
  monthLabel,
  currentAccent,
  onPreview,
  onSave,
  onClose,
  saving,
}: AccentColorPickerProps) {
  const [picked, setPicked] = useState(currentAccent)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Track whether the user actually committed a save so the outside-click /
  // cancel branches know whether to revert the live preview. After save the
  // shell holds the new color in monthSettings, so reverting would flash the
  // old one back on close.
  const savedRef = useRef(false)

  function applyPick(hex: string) {
    setPicked(hex)
    onPreview(hex)
  }

  function cancelAndClose() {
    if (!savedRef.current) onPreview(currentAccent)
    onClose()
  }

  async function handleSave() {
    setError(null)
    try {
      await onSave(picked)
      savedRef.current = true
      onClose()
    } catch {
      setError("Couldn't save, try again")
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelAndClose()
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cancelAndClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown)
    }
    // We intentionally re-bind on every render so cancelAndClose closes over
    // the latest `picked` and `currentAccent` - the listener body is cheap.
  })

  const isPresetActive = (hex: string) => hex.toLowerCase() === picked.toLowerCase()

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Accent color for ${monthLabel}`}
      className="absolute top-full left-0 mt-1.5 z-30 w-[220px] bg-white border border-gray-300 rounded-md p-2.5"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="font-display text-[11px] font-medium text-gray-500 mb-2">
        Accent for {monthLabel}
      </p>

      {/* Preset swatches */}
      <div className="flex items-center gap-1.5 mb-2">
        {ACCENT_PRESETS.map((p) => {
          const active = isPresetActive(p.hex)
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => applyPick(p.hex)}
              aria-label={p.label}
              aria-pressed={active}
              title={p.label}
              className="w-[18px] h-[18px] rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: p.hex,
                boxShadow: active ? '0 0 0 2px #1C1210' : '0 0 0 1px rgba(0,0,0,0.08)',
              }}
            />
          )
        })}
      </div>

      {/* Custom color input */}
      <label className="flex items-center gap-2 mb-2 font-display text-[11px] text-gray-600 cursor-pointer">
        <input
          type="color"
          value={picked}
          onChange={(e) => applyPick(e.target.value)}
          className="w-6 h-6 rounded border border-gray-200 font-sans cursor-pointer"
          aria-label="Custom accent color"
        />
        <span>Custom</span>
        <span className="ml-auto font-mono text-[10px] text-gray-400 uppercase">{picked}</span>
      </label>

      {error && (
        <p role="alert" className="font-sans text-[10px] text-red-600 mb-2">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1.5 border-t border-gray-100">
        <button
          type="button"
          onClick={cancelAndClose}
          disabled={saving}
          className="flex-1 font-display text-[11px] font-medium text-gray-500 py-1 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 font-display text-[11px] font-semibold text-white py-1 rounded transition-opacity disabled:opacity-50"
          style={{ backgroundColor: picked }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

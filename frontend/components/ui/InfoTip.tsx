'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface InfoTipProps {
  // The explanation shown in the popover.
  children: React.ReactNode
  // Accessible label for the trigger button.
  label?: string
}

// A small "?" circle that opens a tasteful info popover on click. The popover is
// rendered through a portal and positioned with fixed coordinates from the
// trigger's rect, so it never gets clipped by an ancestor's `overflow` (e.g.
// inside a scrolling modal body). Closes on outside click, Escape, or scroll.
export default function InfoTip({ children, label = 'More info' }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })

    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // Close on scroll - the fixed popover would otherwise drift from the trigger.
    function onScroll() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-label={label}
        aria-expanded={open}
        className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-muted/60 text-[9px] font-bold leading-none text-muted transition-colors hover:border-foreground hover:text-foreground"
      >
        ?
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          role="tooltip"
          className="fixed z-[60] w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border bg-surface p-3 text-left shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5"
          style={{ top: pos.top, left: pos.left }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

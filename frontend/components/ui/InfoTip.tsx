'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface InfoTipProps {
  // The explanation shown in the popover.
  children: React.ReactNode
  // Accessible label for the trigger button.
  label?: string
  // Open on hover as well as click. Default true. Click still toggles so the
  // tip works on touch screens, where there is no hover.
  hover?: boolean
}

const OPEN_DELAY_MS = 120
const CLOSE_DELAY_MS = 160
const FADE_MS = 150

// A small "i" circle that opens an info popover - on hover (desktop) or tap
// (phones). The popover is rendered through a portal and positioned with
// fixed coordinates from the trigger's rect, so it never gets clipped by an
// ancestor's `overflow` (e.g. inside a scrolling modal body). It fades and
// scales in over FADE_MS, and fades out before unmounting. Closes on outside
// click, Escape, scroll, or when the pointer leaves both trigger and popover.
export default function InfoTip({ children, label = 'More info', hover = true }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Two-phase close so the fade-out can play before the node goes away.
  function close() {
    clearTimer()
    setShown(false)
    timer.current = window.setTimeout(() => setOpen(false), FADE_MS)
  }

  function openNow() {
    clearTimer()
    setOpen(true)
  }

  function scheduleOpen() {
    clearTimer()
    timer.current = window.setTimeout(openNow, OPEN_DELAY_MS)
  }

  function scheduleClose() {
    clearTimer()
    timer.current = window.setTimeout(close, CLOSE_DELAY_MS)
  }

  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
    // Mount hidden, then flip to visible on the next frame so the CSS
    // transition has a starting state to animate from.
    const raf = window.requestAnimationFrame(() => setShown(true))

    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    // Close on scroll - the fixed popover would otherwise drift from the trigger.
    function onScroll() {
      close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => clearTimer, [])

  const hoverHandlers = hover
    ? {
        onMouseEnter: scheduleOpen,
        onMouseLeave: scheduleClose,
      }
    : {}

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (open && shown) close()
          else openNow()
        }}
        {...hoverHandlers}
        aria-label={label}
        aria-expanded={open}
        className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-muted/60 font-serif text-[10px] font-bold italic leading-none text-muted transition-colors hover:border-foreground hover:text-foreground"
      >
        i
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            {...hoverHandlers}
            className={`fixed z-[60] w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border bg-surface p-3 text-left font-sans text-sm leading-snug text-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 transition-[opacity,transform] duration-150 ease-out ${
              shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            style={{ top: pos.top, left: pos.left }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}

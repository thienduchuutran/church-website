'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const EXIT_MS = 280

export default function ModalShell({
  title,
  labelId,
  onClose,
  children,
}: {
  title: string
  labelId: string
  onClose: () => void
  // Render prop: receives the animated-close fn so children can trigger the
  // exit animation instead of calling onClose directly (which would unmount
  // the modal immediately, skipping the animation).
  children: (close: () => void) => React.ReactNode
}) {
  const [closing, setClosing] = useState(false)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
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
        className={`relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45),0_10px_30px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/5 will-change-transform sm:p-8 ${closing ? 'apple-sheet-out' : 'apple-sheet-in'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h1 id={labelId} className="mb-6 font-serif text-2xl font-bold text-foreground">
          {title}
        </h1>

        {children(handleClose)}
      </div>
    </div>,
    document.body,
  )
}

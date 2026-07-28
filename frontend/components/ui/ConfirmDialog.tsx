'use client'

import { useEffect, useRef } from 'react'
import ModalShell from './ModalShell'

export interface ConfirmOptions {
  title: string
  // ReactNode rather than string so a caller can bold the thing being deleted
  // instead of burying it in a sentence.
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  // 'danger' colours the confirm button red. Use it for anything that destroys
  // data; the colour is the last cue before the click.
  tone?: 'default' | 'danger'
}

// ConfirmDialog is the presentational half - it renders one confirmation and
// reports the answer. It does not know how to be summoned; that is ConfirmProvider
// in lib/confirm.tsx, which is what callers actually use.
//
// Built on ModalShell so confirmations inherit the same backdrop blur and
// spring in/out animation as every other sheet in the app. A confirm that
// appeared instantly next to modals that animate would read as a different,
// cheaper part of the product.
export default function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions
  onResolve: (confirmed: boolean) => void
}) {
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default' } = options

  // ModalShell resolves onClose AFTER its exit animation, and every dismissal
  // route (Escape, backdrop, the X, Cancel) funnels through it. So the answer
  // is parked here first and read when the animation finishes - that way the
  // dialog animates out on confirm too, instead of vanishing on click.
  const answer = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Remember what had focus so it can be handed back on close - otherwise
    // focus falls to <body> and a keyboard user restarts from the top of the page.
    restoreFocusTo.current = document.activeElement as HTMLElement | null
    // Focus Cancel, not Confirm. For a destructive prompt the safe option is
    // the one that should be one Enter away.
    cancelRef.current?.focus()
    return () => restoreFocusTo.current?.focus?.()
  }, [])

  return (
    <ModalShell
      title={title}
      labelId="confirm-dialog-title"
      size="sm"
      onClose={() => onResolve(answer.current)}
    >
      {(close) => (
        <>
          <div className="font-sans text-sm leading-relaxed text-muted">{message}</div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => {
                answer.current = false
                close()
              }}
              className="rounded-lg border border-border px-4 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                answer.current = true
                close()
              }}
              className={`rounded-lg px-4 py-2.5 font-display text-sm font-medium text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                tone === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600'
                  : 'bg-primary hover:bg-primary-light focus-visible:outline-primary'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

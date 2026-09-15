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
  // When present, the single Confirm button is replaced by this list and the
  // answer is the chosen id instead of `true`. Added for the recurring-event
  // scope prompt (this one / this and following / all), which is a three-way
  // question a yes/no dialog cannot ask.
  //
  // Deliberately an extension of this component rather than a second modal:
  // one shell means one set of focus, escape, backdrop and animation
  // behaviours to keep correct, and a bespoke dialog would drift from the rest
  // of the app the first time either was touched.
  choices?: ConfirmChoice[]
}

export interface ConfirmChoice {
  id: string
  label: string
  // One line under the label. Worth filling in for anything destructive - the
  // difference between "this event" and "all events" is forty birthdays.
  description?: string
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
  // `false` means dismissed. A string is the id of the chosen option, and for a
  // plain yes/no dialog that string is 'confirm'.
  onResolve: (answer: string | false) => void
}) {
  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', choices } = options

  // ModalShell resolves onClose AFTER its exit animation, and every dismissal
  // route (Escape, backdrop, the X, Cancel) funnels through it. So the answer
  // is parked here first and read when the animation finishes - that way the
  // dialog animates out on confirm too, instead of vanishing on click.
  const answer = useRef<string | false>(false)
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

          {choices && (
            // Stacked full-width rows rather than a button row: these options
            // differ by how much they destroy, so they need reading rather than
            // scanning, and equal visual weight stops the widest-reaching one
            // from looking like the default.
            <div className="mt-4 flex flex-col gap-2">
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    answer.current = c.id
                    close()
                  }}
                  className="rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="block font-display text-sm font-medium text-foreground">{c.label}</span>
                  {c.description && (
                    <span className="mt-0.5 block font-sans text-xs text-muted">{c.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}

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
            {!choices && (
              <button
                type="button"
                onClick={() => {
                  answer.current = 'confirm'
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
            )}
          </div>
        </>
      )}
    </ModalShell>
  )
}

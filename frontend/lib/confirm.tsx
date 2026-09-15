'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ConfirmDialog, { type ConfirmChoice, type ConfirmOptions } from '@/components/ui/ConfirmDialog'

// A promise-based replacement for window.confirm.
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title, message, tone: 'danger' }))) return
//
// The shape deliberately mirrors window.confirm - ask, get a boolean, bail on
// false - so call sites read the same as before. What changes is that the
// prompt is our own dialog: it matches the app's typography, animates in and
// out like every other sheet, can bold the thing being deleted, and does not
// freeze the JS thread or get suppressed by "prevent this page from creating
// additional dialogs".
//
// Never reintroduce window.confirm / window.alert / window.prompt for product
// flows. The browser chrome is unstyleable, looks like a phishing warning on
// some platforms, and is silently blocked in others.
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

// The multi-answer sibling of ConfirmFn. Resolves to the chosen option's id, or
// null when the dialog was dismissed - so a call site that ignores the null
// cannot proceed with an unchosen scope.
type ChooseFn = (options: ConfirmOptions & { choices: ConfirmChoice[] }) => Promise<string | null>

// Default resolves true, matching UnsavedChangesContext's "proceed when no
// provider" convention. The provider is mounted at the root layout, so this
// only ever applies to an isolated render (a test harness, a stray subtree).
const ConfirmContext = createContext<ConfirmFn>(async () => true)

// Null by default rather than a made-up id: with no provider mounted there is
// no answer, and inventing one would be exactly the silent default the scope
// prompt exists to prevent.
const ChooseContext = createContext<ChooseFn>(async () => null)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

// useChoose asks a question with more than two answers - currently the
// recurring-event scope prompt. Same dialog, same animation, same focus
// handling; only the button row differs.
export function useChoose(): ChooseFn {
  return useContext(ChooseContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  // Carries the raw answer - `false` for dismissed, otherwise the chosen id.
  // Both hooks share this one resolver, so there is still only ever one dialog
  // and one pending promise.
  const resolver = useRef<((value: string | false) => void) | null>(null)

  const ask = useCallback((options: ConfirmOptions) => {
    // One dialog at a time. If something asks while a prompt is already open,
    // the older question is answered "no" rather than left as a promise that
    // never settles and an await that never returns.
    resolver.current?.(false)
    setPending(options)
    return new Promise<string | false>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const confirm = useCallback<ConfirmFn>(async (options) => (await ask(options)) !== false, [ask])

  const choose = useCallback<ChooseFn>(
    async (options) => {
      const answer = await ask(options)
      return answer === false ? null : answer
    },
    [ask],
  )

  const handleResolve = useCallback((value: string | false) => {
    const resolve = resolver.current
    resolver.current = null
    setPending(null)
    resolve?.(value)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      <ChooseContext.Provider value={choose}>
        {children}
        {pending && <ConfirmDialog options={pending} onResolve={handleResolve} />}
      </ChooseContext.Provider>
    </ConfirmContext.Provider>
  )
}

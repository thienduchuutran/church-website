'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import ConfirmDialog, { type ConfirmOptions } from '@/components/ui/ConfirmDialog'

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

// Default resolves true, matching UnsavedChangesContext's "proceed when no
// provider" convention. The provider is mounted at the root layout, so this
// only ever applies to an isolated render (a test harness, a stray subtree).
const ConfirmContext = createContext<ConfirmFn>(async () => true)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    // One dialog at a time. If something asks while a prompt is already open,
    // the older question is answered "no" rather than left as a promise that
    // never settles and an await that never returns.
    resolver.current?.(false)
    setPending(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const handleResolve = useCallback((value: boolean) => {
    const resolve = resolver.current
    resolver.current = null
    setPending(null)
    resolve?.(value)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog options={pending} onResolve={handleResolve} />}
    </ConfirmContext.Provider>
  )
}

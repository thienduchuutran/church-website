'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'

// A tiny app-wide registry of "this surface has unsaved edits." Forms register
// their dirty state; the LanguageSwitcher (and a native beforeunload guard) ask
// the registry before letting work be discarded.
//
// Why a ref-set rather than React state: the only consumers are imperative
// checks (confirmDiscard, beforeunload), never render. Keeping it in a ref means
// a keystroke that flips dirtiness doesn't re-render the whole provider subtree.
interface UnsavedChangesApi {
  setDirty: (key: string, dirty: boolean) => void
  hasUnsaved: () => boolean
  // Returns true when it's safe to proceed (nothing dirty, or the user accepted
  // the discard prompt); false when the user cancelled.
  confirmDiscard: (message?: string) => boolean
}

const noop = () => {}
const UnsavedChangesContext = createContext<UnsavedChangesApi>({
  setDirty: noop,
  hasUnsaved: () => false,
  confirmDiscard: () => true,
})

export function useUnsavedChanges(): UnsavedChangesApi {
  return useContext(UnsavedChangesContext)
}

// Convenience hook for a form: register `dirty` under a stable `key`, with
// automatic cleanup on unmount so a closed/destroyed form never leaves a stale
// dirty flag behind.
export function useRegisterUnsaved(key: string, dirty: boolean): void {
  const { setDirty } = useUnsavedChanges()
  useEffect(() => {
    setDirty(key, dirty)
    return () => setDirty(key, false)
  }, [key, dirty, setDirty])
}

const DEFAULT_MESSAGE = 'You have unsaved changes that will be lost. Continue?'

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirty = useRef<Set<string>>(new Set())

  const setDirty = useCallback((key: string, isDirty: boolean) => {
    if (isDirty) dirty.current.add(key)
    else dirty.current.delete(key)
  }, [])

  const hasUnsaved = useCallback(() => dirty.current.size > 0, [])

  const confirmDiscard = useCallback((message: string = DEFAULT_MESSAGE) => {
    if (dirty.current.size === 0) return true
    return window.confirm(message)
  }, [])

  // Native guard for real unloads the SPA can't intercept: tab close, hard
  // refresh, or navigating to an external URL. The in-app locale switch is
  // handled by confirmDiscard (a nicer prompt); this is the safety net.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current.size === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const value = useMemo(
    () => ({ setDirty, hasUnsaved, confirmDiscard }),
    [setDirty, hasUnsaved, confirmDiscard],
  )

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

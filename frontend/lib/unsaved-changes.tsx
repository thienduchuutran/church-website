'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useConfirm } from './confirm'

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
  // Resolves true when it's safe to proceed (nothing dirty, or the user
  // accepted the discard prompt); false when they cancelled.
  //
  // Async because the prompt is now an in-app dialog rather than window.confirm.
  // The browser dialog blocked the JS thread and returned synchronously; ours
  // animates in and resolves on click, so callers must await it.
  confirmDiscard: (message?: string) => Promise<boolean>
}

const noop = () => {}
const UnsavedChangesContext = createContext<UnsavedChangesApi>({
  setDirty: noop,
  hasUnsaved: () => false,
  confirmDiscard: async () => true,
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

// The dialog supplies the question in its title, so this is the detail line.
const DEFAULT_MESSAGE = 'Your edits have not been saved yet and will be lost if you continue.'

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirty = useRef<Set<string>>(new Set())
  const confirm = useConfirm()

  const setDirty = useCallback((key: string, isDirty: boolean) => {
    if (isDirty) dirty.current.add(key)
    else dirty.current.delete(key)
  }, [])

  const hasUnsaved = useCallback(() => dirty.current.size > 0, [])

  const confirmDiscard = useCallback(
    async (message: string = DEFAULT_MESSAGE) => {
      if (dirty.current.size === 0) return true
      return confirm({
        title: 'Discard unsaved changes?',
        message,
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      })
    },
    [confirm],
  )

  // The one place a browser dialog is unavoidable: real unloads the SPA cannot
  // intercept (tab close, hard refresh, external URL). Browsers only allow
  // their own prompt here - a custom dialog cannot block an unload - so this
  // stays native. Every in-app discard goes through confirmDiscard instead.
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

'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

function readDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearSessionDraft(key: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// useState whose value is mirrored to sessionStorage under `key` and restored on
// the next mount. This is what lets in-progress edits survive the [locale]
// remount on a language switch (and a full page refresh) until the tab closes.
//
// IMPORTANT: use this only in components that are NOT server-rendered (modals,
// post-auth client pages). It seeds state from sessionStorage in the useState
// initializer, which would cause a hydration mismatch if the same component were
// part of the initial SSR payload.
//
// Returns the standard [value, setValue] plus clear() to drop the draft once the
// work is committed (save) or explicitly abandoned (cancel).
export function useSessionDraft<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    const draft = readDraft<T>(key)
    return draft !== null ? draft : initial
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota/serialization failures - a dropped draft is recoverable,
      // a thrown render is not.
    }
  }, [key, value])

  const clear = useCallback(() => clearSessionDraft(key), [key])

  return [value, setValue, clear]
}

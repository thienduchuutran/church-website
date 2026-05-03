'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import EditPostModal from '@/components/features/admin/EditPostModal'

interface EditModalState {
  openEdit: (postId: string) => void
  notifyChanged: () => void
  // Bumped after any post mutation (save or delete). Client-rendered pages
  // (e.g. /admin) include this in their useEffect deps to refetch immediately.
  savedAt: number
}

const EditModalContext = createContext<EditModalState>({
  openEdit: () => {},
  notifyChanged: () => {},
  savedAt: 0,
})

export const useEditModal = () => useContext(EditModalContext)

export function EditModalProvider({ children }: { children: React.ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)

  const notifyChanged = useCallback(() => setSavedAt(Date.now()), [])

  const value = useMemo(
    () => ({ openEdit: (id: string) => setEditingId(id), notifyChanged, savedAt }),
    [notifyChanged, savedAt],
  )

  return (
    <EditModalContext.Provider value={value}>
      {children}
      {editingId && (
        <EditPostModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={notifyChanged}
        />
      )}
    </EditModalContext.Provider>
  )
}

'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import EditPostModal from '@/components/features/admin/EditPostModal'

interface EditModalState {
  openEdit: (postId: string) => void
  // Bumped after a successful save. Client-rendered pages (e.g. /admin) that
  // fetch posts in a useEffect can include this in their dependency array to
  // refetch immediately, since router.refresh() only re-runs server components.
  savedAt: number
}

const EditModalContext = createContext<EditModalState>({
  openEdit: () => {},
  savedAt: 0,
})

export const useEditModal = () => useContext(EditModalContext)

export function EditModalProvider({ children }: { children: React.ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)

  const value = useMemo(
    () => ({ openEdit: (id: string) => setEditingId(id), savedAt }),
    [savedAt],
  )

  return (
    <EditModalContext.Provider value={value}>
      {children}
      {editingId && (
        <EditPostModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => setSavedAt(Date.now())}
        />
      )}
    </EditModalContext.Provider>
  )
}

'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import EditPostModal from '@/components/features/admin/EditPostModal'

interface EditModalState {
  openEdit: (postId: string) => void
}

const EditModalContext = createContext<EditModalState>({
  openEdit: () => {},
})

export const useEditModal = () => useContext(EditModalContext)

export function EditModalProvider({ children }: { children: React.ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const value = useMemo(
    () => ({ openEdit: (id: string) => setEditingId(id) }),
    [],
  )

  return (
    <EditModalContext.Provider value={value}>
      {children}
      {editingId && (
        <EditPostModal id={editingId} onClose={() => setEditingId(null)} />
      )}
    </EditModalContext.Provider>
  )
}

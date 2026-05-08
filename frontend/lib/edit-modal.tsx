'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import PostEditorModal from '@/components/features/admin/PostEditorModal'
import ModalShell from '@/components/ui/ModalShell'
import CreatePostForm from '@/components/features/admin/CreatePostForm'
import { POST_TYPE_LABELS } from '@/lib/post-types'

interface EditModalState {
  openEdit: (postId: string) => void
  openCreate: (section: string) => void
  notifyChanged: () => void
  // Bumped after any post mutation (save or delete). Client-rendered pages
  // (e.g. /admin) include this in their useEffect deps to refetch immediately.
  savedAt: number
}

const EditModalContext = createContext<EditModalState>({
  openEdit: () => {},
  openCreate: () => {},
  notifyChanged: () => {},
  savedAt: 0,
})

export const useEditModal = () => useContext(EditModalContext)

export function EditModalProvider({ children }: { children: React.ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingSection, setCreatingSection] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)

  const notifyChanged = useCallback(() => setSavedAt(Date.now()), [])

  const value = useMemo(
    () => ({
      openEdit: (id: string) => setEditingId(id),
      openCreate: (section: string) => setCreatingSection(section),
      notifyChanged,
      savedAt,
    }),
    [notifyChanged, savedAt],
  )

  return (
    <EditModalContext.Provider value={value}>
      {children}
      {editingId && (
        <PostEditorModal
          id={editingId}
          onClose={() => setEditingId(null)}
          onSaved={notifyChanged}
        />
      )}
      {creatingSection && (
        <ModalShell
          title={`New ${POST_TYPE_LABELS[creatingSection] ?? creatingSection}`}
          labelId="create-post-title"
          onClose={() => setCreatingSection(null)}
        >
          {(close) => (
            <CreatePostForm
              section={creatingSection}
              onSuccess={() => { notifyChanged(); close() }}
              onCancel={close}
            />
          )}
        </ModalShell>
      )}
    </EditModalContext.Provider>
  )
}

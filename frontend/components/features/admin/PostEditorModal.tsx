'use client'

import { useEffect, useState } from 'react'
import { getPost } from '@/lib/posts'
import type { Post } from '@/lib/types'
import ModalShell from '@/components/ui/ModalShell'
import EditPostForm from './EditPostForm'

export default function PostEditorModal({
  id,
  onClose,
  onSaved,
}: {
  id: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [post, setPost] = useState<Post | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    getPost(id)
      .then(setPost)
      .finally(() => setFetching(false))
  }, [id])

  return (
    <ModalShell title="Edit Post" labelId="edit-post-title" onClose={onClose}>
      {(close) =>
        fetching ? (
          <p className="font-sans text-muted">Loading...</p>
        ) : !post ? (
          <p className="font-sans text-muted">Post not found.</p>
        ) : (
          <EditPostForm
            post={post}
            onSaved={onSaved}
            onSuccess={close}
            onCancel={close}
          />
        )
      }
    </ModalShell>
  )
}

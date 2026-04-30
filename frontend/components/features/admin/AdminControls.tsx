'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useEditModal } from '@/lib/edit-modal'
import { deletePost } from '@/lib/posts'

export default function AdminControls({ postId }: { postId: string }) {
  const { isAdmin, session } = useAuth()
  const { openEdit } = useEditModal()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  if (!isAdmin) return null

  async function handleDelete() {
    if (!session || !confirm('Are you sure you want to delete this post?')) return
    setDeleting(true)
    try {
      await deletePost(postId, session.access_token)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="rounded p-1 text-muted transition-colors hover:bg-primary/10 hover:text-primary"
        title="Edit post"
        onClick={() => openEdit(postId)}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded p-1 text-muted transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
        title="Delete post"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPost } from '@/lib/posts'
import type { Post } from '@/lib/types'
import EditPostForm from './EditPostForm'

export default function EditPostModal({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const [post, setPost] = useState<Post | null>(null)
  const [fetching, setFetching] = useState(true)
  // PageTransition applies a CSS transform to the route wrapper, which
  // creates a containing block for position:fixed descendants. Rendering
  // through document.body escapes that and pins the overlay to the viewport.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    getPost(id)
      .then(setPost)
      .finally(() => setFetching(false))
  }, [id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-post-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded p-1 text-muted transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h1 id="edit-post-title" className="mb-6 text-2xl font-bold text-foreground">
          Edit Post
        </h1>

        {fetching ? (
          <p className="text-muted">Loading...</p>
        ) : !post ? (
          <p className="text-muted">Post not found.</p>
        ) : (
          <EditPostForm post={post} onSuccess={onClose} onCancel={onClose} />
        )}
      </div>
    </div>,
    document.body,
  )
}

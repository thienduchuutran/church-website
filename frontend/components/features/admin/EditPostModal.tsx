'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getPost } from '@/lib/posts'
import type { Post } from '@/lib/types'
import EditPostForm from './EditPostForm'

const EXIT_MS = 240

export default function EditPostModal({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const [post, setPost] = useState<Post | null>(null)
  const [fetching, setFetching] = useState(true)
  const [closing, setClosing] = useState(false)
  // PageTransition applies a CSS transform to the route wrapper, which
  // creates a containing block for position:fixed descendants. Rendering
  // through document.body escapes that and pins the overlay to the viewport.
  const [mounted, setMounted] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    getPost(id)
      .then(setPost)
      .finally(() => setFetching(false))
  }, [id])

  // Run the exit animation, then unmount via the parent's onClose.
  const handleClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(onClose, EXIT_MS)
  }, [closing, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  if (!mounted) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xl backdrop-saturate-150 ${
        closing ? 'apple-backdrop-out' : 'apple-backdrop-in'
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45),0_10px_30px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/5 will-change-transform sm:p-8 ${
          closing ? 'apple-sheet-out' : 'apple-sheet-in'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-post-title"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-primary/10 hover:text-foreground"
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
          <EditPostForm post={post} onSuccess={handleClose} onCancel={handleClose} />
        )}
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { updatePost, replaceTags } from '@/lib/posts'
import type { Post } from '@/lib/types'
import {
  postToFormState,
  toPostPayload,
  type PostFormState,
} from '@/lib/post-types'
import PostFormFields from './PostFormFields'

export default function EditPostForm({
  post,
  onSaved,
  onSuccess,
  onCancel,
}: {
  post: Post
  onSaved?: () => void
  onSuccess: () => void
  onCancel: () => void
}) {
  const { session } = useAuth()
  const router = useRouter()
  const [state, setState] = useState<PostFormState>(() => postToFormState(post))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      await updatePost(post.id, toPostPayload(post.type, state), session.access_token)
      // Save tags for gallery albums
      if (post.type === 'gallery_album') {
        await replaceTags(post.id, state.tagIds, session.access_token)
      }
      router.refresh()
      onSaved?.()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PostFormFields section={post.type} state={state} onChange={setState} postId={post.id} />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-5 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

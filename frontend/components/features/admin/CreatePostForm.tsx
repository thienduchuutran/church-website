'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import { createPost } from '@/lib/posts'
import { useSessionDraft } from '@/lib/use-session-draft'
import { useRegisterUnsaved } from '@/lib/unsaved-changes'
import {
  EMPTY_POST_FORM,
  POST_TYPE_LABELS,
  POST_TYPE_ROUTES,
  toPostPayload,
  type PostFormState,
} from '@/lib/post-types'
import PostFormFields from './PostFormFields'

export default function CreatePostForm({
  section,
  onSuccess,
  onCancel,
}: {
  section: string
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const { session } = useAuth()
  const router = useRouter()
  // Draft persists per section so a half-composed post survives a language
  // switch (which remounts/closes this modal) or an accidental refresh.
  const [state, setState, clearDraft] = useSessionDraft<PostFormState>(
    `post-draft:new:${section}`,
    EMPTY_POST_FORM,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Dirty once anything has been typed. Drives the discard guard + beforeunload.
  useRegisterUnsaved(
    `post-create:${section}`,
    JSON.stringify(state) !== JSON.stringify(EMPTY_POST_FORM),
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      await createPost(toPostPayload(section, state), session.access_token)
      clearDraft() // committed - drop the saved draft
      router.refresh()
      if (onSuccess) {
        onSuccess()
      } else {
        router.push(POST_TYPE_ROUTES[section] ?? '/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  function handleCancel() {
    clearDraft() // explicit discard - drop the saved draft
    if (onCancel) onCancel()
    else router.back()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PostFormFields section={section} state={state} onChange={setState} postId={undefined} />
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
          {saving ? 'Creating...' : `Create ${POST_TYPE_LABELS[section] ?? section}`}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-border px-5 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

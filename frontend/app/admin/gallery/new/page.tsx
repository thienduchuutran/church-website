'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { createPost, replaceTags } from '@/lib/posts'
import type { Tag } from '@/lib/types'
import TagSelector from '@/components/features/gallery/TagSelector'
import BulkUploader from '@/components/features/gallery/BulkUploader'

interface AlbumFormState {
  title: string
  caption: string
  date: string
  tagIds: string[]
}

const INITIAL_STATE: AlbumFormState = {
  title: '',
  caption: '',
  date: '',
  tagIds: [],
}

interface CreateAlbumStep1State {
  form: AlbumFormState
  error: string | null
  submitting: boolean
}

interface CreateAlbumStep2State {
  postId: string
  title: string
  tags: Tag[]
}

export default function CreateAlbumPage() {
  const { session, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [step1, setStep1] = useState<CreateAlbumStep1State>({
    form: INITIAL_STATE,
    error: null,
    submitting: false,
  })
  const [step2, setStep2] = useState<CreateAlbumStep2State | null>(null)

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading...</p>
      </div>
    )
  }

  if (!session || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Not Authorized</h1>
        <p className="font-sans text-muted">You must be an admin to create albums.</p>
      </div>
    )
  }

  async function handleCreateAlbum(e: React.FormEvent) {
    e.preventDefault()
    if (!session || step1.submitting) return

    setStep1(prev => ({ ...prev, submitting: true, error: null }))

    try {
      // Create the post
      const newPost = await createPost(
        {
          type: 'gallery_album',
          title: step1.form.title,
          body: step1.form.caption || null,
          event_date: step1.form.date ? new Date(step1.form.date).toISOString() : null,
          external_link: null,
        },
        session.access_token
      )

      // Assign tags if any selected
      if (step1.form.tagIds.length > 0) {
        await replaceTags(newPost.id, step1.form.tagIds, session.access_token)
      }

      // Transition to Step 2
      setStep2({
        postId: newPost.id,
        title: newPost.title,
        tags: newPost.tags || [],
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create album'
      setStep1(prev => ({ ...prev, error: errorMsg, submitting: false }))
    }
  }

  function handleUploadComplete(storageKeys: string[]) {
    // After upload completes, redirect back to admin dashboard
    router.push('/admin')
  }

  // Step 1: Album Details
  if (!step2) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
            Create Gallery Album
          </h1>
          <p className="font-sans text-muted">
            Add album details and select photos
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-8 space-y-6">
          {/* Title field */}
          <div>
            <label htmlFor="title" className="block font-display text-sm font-medium text-foreground mb-1">
              Album Title *
            </label>
            <input
              id="title"
              type="text"
              required
              placeholder="e.g. Youth Camp Summer 2026"
              value={step1.form.title}
              onChange={(e) =>
                setStep1(prev => ({
                  ...prev,
                  form: { ...prev.form, title: e.target.value },
                }))
              }
              className="block w-full rounded-lg border border-border bg-background px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Date field */}
          <div>
            <label htmlFor="date" className="block font-display text-sm font-medium text-foreground mb-1">
              Date (optional)
            </label>
            <input
              id="date"
              type="date"
              value={step1.form.date}
              onChange={(e) =>
                setStep1(prev => ({
                  ...prev,
                  form: { ...prev.form, date: e.target.value },
                }))
              }
              className="block w-full rounded-lg border border-border bg-background px-4 py-2.5 font-sans text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Caption field */}
          <div>
            <label htmlFor="caption" className="block font-display text-sm font-medium text-foreground mb-1">
              Caption (optional)
            </label>
            <textarea
              id="caption"
              placeholder="Brief description of the album..."
              value={step1.form.caption}
              onChange={(e) =>
                setStep1(prev => ({
                  ...prev,
                  form: { ...prev.form, caption: e.target.value },
                }))
              }
              rows={4}
              className="block w-full rounded-lg border border-border bg-background px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
          </div>

          {/* Tags selector */}
          <TagSelector
            postId="temp"
            selectedTagIds={step1.form.tagIds}
            onTagsChange={(tagIds) =>
              setStep1(prev => ({
                ...prev,
                form: { ...prev.form, tagIds },
              }))
            }
          />

          {/* Error message */}
          {step1.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {step1.error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleCreateAlbum}
              disabled={!step1.form.title.trim() || step1.submitting}
              className="flex-1 rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step1.submitting ? 'Creating...' : 'Create Album & Add Photos'}
            </button>
            <button
              onClick={() => window.history.back()}
              className="rounded-lg border border-border bg-surface px-5 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-background"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Bulk Photo Upload
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Upload Photos to Album
        </h1>
        <p className="font-sans text-muted">
          Add photos to <span className="font-semibold">{step2.title}</span>
        </p>
      </div>

      <BulkUploader
        postId={step2.postId}
        albumTitle={step2.title}
        tags={step2.tags}
        onComplete={handleUploadComplete}
      />
    </div>
  )
}

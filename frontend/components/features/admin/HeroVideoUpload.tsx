'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getHeroVideo, setHeroVideoVisibility, uploadHeroVideo } from '@/lib/hero'
import type { HeroVideo } from '@/lib/types'

const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB - matches backend MaxHeroVideoBytes

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

export default function HeroVideoUpload() {
  const { session } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState<HeroVideo | null | undefined>(undefined)
  const [selected, setSelected] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedVideo, setUploadedVideo] = useState<HeroVideo | null>(null)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    getHeroVideo()
      .then(setCurrent)
      .catch(() => setCurrent(null))
  }, [uploadedVideo])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null)
    setValidationError(null)
    setUploadedVideo(null)
    const file = e.target.files?.[0] ?? null
    setSelected(file)
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setValidationError('Only MP4, WebM, or MOV files are accepted.')
      setSelected(null)
      return
    }
    if (file.size > MAX_BYTES) {
      setValidationError(`File is too large (${formatBytes(file.size)}). Maximum is 200 MB.`)
      setSelected(null)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !session) return
    setUploading(true)
    setUploadError(null)
    try {
      const video = await uploadHeroVideo(selected, session.access_token)
      setUploadedVideo(video)
      setSelected(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleToggle() {
    if (!current || !session) return
    const newVisible = !current.is_visible
    setToggleError(null)
    setCurrent((prev) => (prev ? { ...prev, is_visible: newVisible } : prev)) // optimistic
    setToggling(true)
    try {
      await setHeroVideoVisibility(newVisible, session.access_token)
    } catch {
      setCurrent((prev) => (prev ? { ...prev, is_visible: !newVisible } : prev)) // revert
      setToggleError('Could not update visibility. Please try again.')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
      <div>
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
          Background Video For Homepage
        </h2>
        <p className="mt-1 font-sans text-xs text-muted">
          Replaces the homepage background. Accepts MP4, WebM, or MOV up to 200 MB.
        </p>
      </div>

      {/* Current active video */}
      {current === undefined && (
        <p className="font-sans text-sm text-muted">Loading current video...</p>
      )}
      {current === null && (
        <p className="font-sans text-sm text-muted italic">No video uploaded yet.</p>
      )}
      {current && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-2">
          <p className="font-sans text-xs font-medium uppercase tracking-wider text-muted">
            Active
          </p>
          <p className="font-sans text-sm text-foreground break-all">{current.file_name}</p>
          <div className="flex gap-4 font-sans text-xs text-muted">
            {current.file_size != null && <span>{formatBytes(current.file_size)}</span>}
            {current.content_type && <span>{current.content_type}</span>}
            <span>{new Date(current.created_at).toLocaleDateString()}</span>
          </div>
          {current.video_url && (
            <video
              src={current.video_url}
              className="mt-2 w-full max-h-40 rounded-md object-cover"
              muted
              controls
              aria-label="Current hero background video preview"
            />
          )}
        </div>
      )}

      {/* Visibility toggle — only shown when a video exists */}
      {current && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
          <div>
            <p className="font-sans text-sm font-medium text-foreground">Show on homepage</p>
            <p className="font-sans text-xs text-muted">
              {current.is_visible ? 'Video is visible to visitors' : 'Dark background shown instead'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            role="switch"
            aria-checked={current.is_visible}
            aria-label="Toggle homepage video visibility"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              current.is_visible ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                current.is_visible ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {toggleError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {toggleError}
        </div>
      )}

      {/* Success banner after upload */}
      {uploadedVideo && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700">
          Video uploaded successfully: <strong>{uploadedVideo.file_name}</strong>. Homepage will
          update shortly.
        </div>
      )}

      {/* Upload form */}
      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <label
            htmlFor="hero-video-input"
            className="block font-sans text-xs font-medium text-foreground mb-1.5"
          >
            Select new video
          </label>
          <input
            id="hero-video-input"
            ref={inputRef}
            type="file"
            accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
            onChange={handleFileChange}
            className="block w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:font-display file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
          />
        </div>

        {selected && !validationError && (
          <p className="font-sans text-xs text-muted">
            Selected: {selected.name} ({formatBytes(selected.size)})
          </p>
        )}

        {validationError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
            {validationError}
          </div>
        )}

        {uploadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
            {uploadError}
          </div>
        )}

        <button
          type="submit"
          disabled={!selected || uploading || !!validationError}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload Video'}
        </button>
      </form>
    </div>
  )
}

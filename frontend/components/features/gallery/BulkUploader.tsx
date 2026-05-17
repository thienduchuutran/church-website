'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { uploadImage } from '@/lib/posts'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_CONCURRENT = 5

interface UploadFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'failed'
  progress: number
  error?: string
  storageKey?: string
  preview?: string
}

export interface BulkUploaderProps {
  postId: string
  albumTitle: string
  tags: Array<{ id: string; name: string }>
  onComplete: (storageKeys: string[]) => void
}

export default function BulkUploader({
  postId,
  albumTitle,
  tags,
  onComplete,
}: BulkUploaderProps) {
  const { session } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragZoneRef = useRef<HTMLDivElement>(null)
  const [files, setFiles] = useState<UploadFile[]>([])
  const [hasStartedUploading, setHasStartedUploading] = useState(false)

  const uploadingCountRef = useRef(0)
  const queueRef = useRef<string[]>([])

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const inFlight = files.some(
        f => f.status === 'uploading' || (hasStartedUploading && f.status === 'pending')
      )
      if (inFlight) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasStartedUploading, files])

  function validateFiles(fileList: FileList): UploadFile[] {
    const validated: UploadFile[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]

      if (!ACCEPTED_TYPES.includes(file.type)) {
        continue
      }

      if (file.size > MAX_BYTES) {
        continue
      }

      const id = `${Date.now()}-${Math.random()}`
      validated.push({
        id,
        file,
        status: 'pending',
        progress: 0,
        preview: URL.createObjectURL(file),
      })
    }

    return validated
  }

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList) return

    const newFiles = validateFiles(fileList)
    if (newFiles.length === 0) return

    setFiles(prev => [...prev, ...newFiles])

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  function handleStartUpload() {
    setHasStartedUploading(true)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.add('bg-primary/5', 'border-primary')
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-primary/5', 'border-primary')
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('bg-primary/5', 'border-primary')
    handleFileSelect(e.dataTransfer.files)
  }

  async function uploadFile(fileId: string) {
    if (!session) return

    const fileObj = files.find(f => f.id === fileId)
    if (!fileObj) return

    try {
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, status: 'uploading' as const } : f
        )
      )

      const response = await uploadImage(postId, fileObj.file, session.access_token)

      setFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'done' as const, progress: 100, storageKey: response.key }
            : f
        )
      )
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, status: 'failed' as const, error: errorMsg } : f
        )
      )
    } finally {
      uploadingCountRef.current -= 1
      processQueue()
    }
  }

  function processQueue() {
    while (uploadingCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const fileId = queueRef.current.shift()!
      uploadingCountRef.current += 1
      uploadFile(fileId)
    }
  }

  function handleRetry(fileId: string) {
    setFiles(prev =>
      prev.map(f =>
        f.id === fileId ? { ...f, status: 'pending', progress: 0, error: undefined } : f
      )
    )
    setHasStartedUploading(true)
    queueRef.current.push(fileId)
    processQueue()
  }

  function handleRemove(fileId: string) {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  function handleFinish() {
    const keys = files
      .filter(f => f.status === 'done' && f.storageKey)
      .map(f => f.storageKey!)
    onComplete(keys)
  }

  useEffect(() => {
    if (!hasStartedUploading) return

    const pendingFiles = files.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) return

    pendingFiles.forEach(f => {
      if (!queueRef.current.includes(f.id)) {
        queueRef.current.push(f.id)
      }
    })
    processQueue()
  }, [files, hasStartedUploading])

  const doneCount = files.filter(f => f.status === 'done').length
  const failedCount = files.filter(f => f.status === 'failed').length
  const pendingCount = files.filter(f => f.status === 'pending').length
  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'failed')

  return (
    <div className="space-y-6">
      {/* Confirmation banner */}
      <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
        <p className="font-display text-sm font-medium text-foreground mb-1">
          Album: <span className="font-semibold">{albumTitle}</span>
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag.id} className="inline-block rounded-full bg-primary px-2.5 py-1 font-sans text-xs font-medium text-white">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Progress counter */}
      {files.length > 0 && (
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            {hasStartedUploading
              ? `${doneCount} / ${files.length} uploaded`
              : `${files.length} ${files.length === 1 ? 'photo' : 'photos'} ready`}
          </p>
          {failedCount > 0 && (
            <p className="font-sans text-sm text-red-600">
              {failedCount} {failedCount === 1 ? 'file' : 'files'} failed
            </p>
          )}
        </div>
      )}

      {/* Drop zone or success state */}
      {!allDone && (
        <div
          ref={dragZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="rounded-lg border-2 border-dashed border-border bg-surface/50 p-12 text-center transition-colors"
        >
          <p className="font-display text-lg font-medium text-foreground mb-2">
            Drop photos here
          </p>
          <p className="font-sans text-sm text-muted mb-4">
            or click to select (JPEG, PNG, WebP, GIF · max 10 MB each)
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-accent px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-accent-light"
          >
            Select Photos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(',')}
            onChange={e => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </div>
      )}

      {/* Photo grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {files.map(file => (
            <div key={file.id} className="relative group">
              {/* Thumbnail */}
              {file.preview && (
                <img
                  src={file.preview}
                  alt={file.file.name}
                  className="w-full h-24 object-cover rounded-lg bg-border"
                />
              )}

              {/* Status overlay */}
              {file.status !== 'done' && (
                <div className="absolute inset-0 rounded-lg bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {file.status === 'uploading' && (
                    <div className="text-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
                      <p className="font-sans text-xs text-white">{Math.round(file.progress)}%</p>
                    </div>
                  )}
                  {file.status === 'pending' && (
                    <p className="font-sans text-xs text-white">Pending...</p>
                  )}
                  {file.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleRetry(file.id)}
                      className="rounded bg-red-600 px-2 py-1 font-sans text-xs font-medium text-white hover:bg-red-700"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {/* Success checkmark */}
              {file.status === 'done' && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">✓</span>
                </div>
              )}

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(file.id)}
                className="absolute top-1 left-1 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${file.file.name}`}
              >
                <span className="text-xs text-white">×</span>
              </button>

              {/* Filename and size */}
              <p className="font-sans text-xs text-muted truncate mt-1">
                {file.file.name}
              </p>
              <p className="font-sans text-xs text-muted">
                {(file.file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Success state */}
      {allDone && files.length > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <p className="font-display text-lg font-semibold text-green-900 mb-2">
            ✓ Album published with {doneCount} {doneCount === 1 ? 'photo' : 'photos'}
          </p>
          {failedCount > 0 && (
            <p className="font-sans text-sm text-red-600 mb-4">
              {failedCount} {failedCount === 1 ? 'photo' : 'photos'} could not upload
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <a
              href="/gallery"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light"
            >
              View Album
            </a>
            <button
              type="button"
              onClick={() => {
                setFiles([])
                setHasStartedUploading(false)
                queueRef.current = []
              }}
              className="rounded-lg border border-primary bg-surface px-5 py-2.5 font-display text-sm font-medium text-primary transition-colors hover:bg-primary/5"
            >
              Upload Another Album
            </button>
          </div>
        </div>
      )}

      {/* Upload button - shown before the first commit, while files are still staging */}
      {!hasStartedUploading && pendingCount > 0 && (
        <button
          type="button"
          onClick={handleStartUpload}
          className="w-full rounded-lg bg-accent px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-accent-light"
        >
          Upload {pendingCount} {pendingCount === 1 ? 'photo' : 'photos'}
        </button>
      )}

      {/* Finish button (if some files succeeded and nothing left to upload) */}
      {!allDone && doneCount > 0 && pendingCount === 0 && (
        <button
          type="button"
          onClick={handleFinish}
          className="w-full rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light"
        >
          Finish
        </button>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { apiPost } from '@/lib/api'
import type { PostType } from '@/lib/types'

const TYPE_CONFIG: Record<
  string,
  { label: string; fields: ('body' | 'event_date' | 'external_link')[] }
> = {
  event: { label: 'Event', fields: ['body', 'event_date', 'external_link'] },
  announcement: { label: 'Announcement', fields: ['body'] },
  bible_study: { label: 'Bible Study', fields: ['body', 'external_link'] },
  playlist: { label: 'Playlist', fields: ['external_link'] },
  gallery_album: { label: 'Gallery Album', fields: ['body', 'external_link'] },
}

const SECTION_ROUTES: Record<string, string> = {
  event: '/events',
  announcement: '/announcements',
  bible_study: '/resources',
  playlist: '/resources',
  gallery_album: '/gallery',
}

export default function AdminPostForm({ section }: { section: string }) {
  const { session } = useAuth()
  const router = useRouter()
  const config = TYPE_CONFIG[section]

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [externalLink, setExternalLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!config) {
    return (
      <p className="text-muted">
        Unknown section: <code>{section}</code>
      </p>
    )
  }

  const hasField = (f: string) => config.fields.includes(f as 'body' | 'event_date' | 'external_link')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return

    setSaving(true)
    setError(null)

    try {
      await apiPost(
        '/api/v1/posts',
        {
          type: section as PostType,
          title,
          body: body || null,
          event_date: eventDate ? new Date(eventDate).toISOString() : null,
          external_link: externalLink || null,
        },
        session.access_token,
      )
      router.push(SECTION_ROUTES[section] ?? '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-foreground">
          Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          placeholder={`Enter ${config.label.toLowerCase()} title`}
        />
      </div>

      {hasField('body') && (
        <div>
          <label htmlFor="body" className="mb-1 block text-sm font-medium text-foreground">
            Body
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="Write your content here..."
          />
        </div>
      )}

      {hasField('event_date') && (
        <div>
          <label htmlFor="eventDate" className="mb-1 block text-sm font-medium text-foreground">
            Event Date *
          </label>
          <input
            id="eventDate"
            type="datetime-local"
            required
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
      )}

      {hasField('external_link') && (
        <div>
          <label htmlFor="externalLink" className="mb-1 block text-sm font-medium text-foreground">
            External Link
          </label>
          <input
            id="externalLink"
            type="url"
            value={externalLink}
            onChange={(e) => setExternalLink(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="https://..."
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          {saving ? 'Creating...' : `Create ${config.label}`}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

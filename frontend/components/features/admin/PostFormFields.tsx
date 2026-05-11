'use client'

import {
  POST_TYPE_FIELDS,
  POST_TYPE_LABELS,
  type PostFormState,
} from '@/lib/post-types'
import { RichBodyEditor } from '@/components/editor/RichBodyEditor'

const INPUT_CLASS =
  'block w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none'

export default function PostFormFields({
  section,
  state,
  onChange,
}: {
  section: string
  state: PostFormState
  onChange: (next: PostFormState) => void
}) {
  const fields = POST_TYPE_FIELDS[section]
  if (!fields) {
    return (
      <p className="font-sans text-muted">
        Unknown section: <code>{section}</code>
      </p>
    )
  }

  const label = POST_TYPE_LABELS[section] ?? section
  const has = (f: 'body' | 'event_date' | 'external_link') => fields.includes(f)

  return (
    <>
      <div>
        <label htmlFor="title" className="mb-1 block font-display text-sm font-medium text-foreground">
          Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={state.title}
          onChange={(e) => onChange({ ...state, title: e.target.value })}
          className={INPUT_CLASS}
          placeholder={`Enter ${label.toLowerCase()} title`}
        />
      </div>

      {has('body') && (
        <div>
          <label className="mb-1 block font-display text-sm font-medium text-foreground">
            Body
          </label>
          <RichBodyEditor
            value={state.body}
            onChange={(html) => onChange({ ...state, body: html })}
            placeholder="Write your content here..."
          />
        </div>
      )}

      {has('event_date') && (
        <div>
          <label htmlFor="eventDate" className="mb-1 block font-display text-sm font-medium text-foreground">
            Event Date *
          </label>
          <input
            id="eventDate"
            type="datetime-local"
            required
            value={state.eventDate}
            onChange={(e) => onChange({ ...state, eventDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
      )}

      {has('external_link') && (
        <div>
          <label htmlFor="externalLink" className="mb-1 block font-display text-sm font-medium text-foreground">
            External Link
          </label>
          <input
            id="externalLink"
            type="url"
            value={state.externalLink}
            onChange={(e) => onChange({ ...state, externalLink: e.target.value })}
            className={INPUT_CLASS}
            placeholder="https://..."
          />
        </div>
      )}
    </>
  )
}

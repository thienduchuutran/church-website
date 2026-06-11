'use client'

import {
  POST_TYPE_FIELDS,
  POST_TYPE_LABELS,
  type PostFormState,
} from '@/lib/post-types'
import { RichBodyEditor } from '@/components/editor/RichBodyEditor'
import TagSelector from '@/components/features/gallery/TagSelector'

// touch-manipulation removes iOS's 300ms double-tap delay, which makes the
// browser less likely to route a "dismiss-picker" tap into a focus event on
// the wrong neighbouring field. text-base keeps font-size at 16px so iOS
// never auto-zooms on focus (any input < 16px triggers the zoom heuristic).
// scroll-mt-24 gives ~6rem of breathing room when iOS scrolls a focused
// input into view, so the modal doesn't snap fields under the native picker.
const INPUT_CLASS =
  'block w-full scroll-mt-24 touch-manipulation rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-base text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none'

export default function PostFormFields({
  section,
  state,
  onChange,
  postId,
}: {
  section: string
  state: PostFormState
  onChange: (next: PostFormState) => void
  postId?: string
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
  const isGalleryAlbum = section === 'gallery_album'

  // Split eventDate ("YYYY-MM-DDTHH:mm") into halves so we can render two
  // smaller native pickers instead of one datetime-local. Smaller iOS
  // overlays = less modal scroll shift on dismiss.
  const dateParts = state.eventDate.split('T')
  const dateOnly = dateParts[0] ?? ''
  const timeOnly = (dateParts[1] ?? '').slice(0, 5)

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
            Event Date <span className="font-normal text-muted">(optional)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              id="eventDate"
              type="date"
              value={dateOnly}
              onChange={(e) =>
                onChange({ ...state, eventDate: `${e.target.value}T${timeOnly}` })
              }
              className={INPUT_CLASS}
            />
            <input
              id="eventTime"
              type="time"
              value={timeOnly}
              onChange={(e) =>
                onChange({ ...state, eventDate: `${dateOnly}T${e.target.value}` })
              }
              className={INPUT_CLASS}
              aria-label="Event time"
            />
          </div>
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

      {isGalleryAlbum && postId && (
        <div>
          <TagSelector
            postId={postId}
            selectedTagIds={state.tagIds}
            onTagsChange={(tagIds) => onChange({ ...state, tagIds })}
          />
        </div>
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import type { AdminTranslation } from '@/lib/translations'

// Per-table human labels for the small badge in the card header. Keep this
// table tight and source-driven - if the backend adds a new table_name, the
// fallback at line bottom renders it raw so we never break, but the badge
// loses its hand-tuned color.
const TABLE_LABELS: Record<string, { label: string; className: string }> = {
  posts: {
    label: 'Post',
    className: 'bg-primary/12 text-primary',
  },
  page_content: {
    label: 'Page',
    className: 'bg-amber-100 text-amber-700',
  },
  calendar_events: {
    label: 'Event',
    className: 'bg-accent/15 text-accent',
  },
  calendar_month_notes: {
    label: 'Month note',
    className: 'bg-emerald-100 text-emerald-700',
  },
}

// Sage is the spec's secondary color for "approved" indicators and the
// "Save edits" button - matches the calendar's SAGE accent. We use inline
// style rather than a Tailwind utility because Tailwind 4 purges class names
// it can't see at build time, and the brand palette is small enough that
// inline hex is the simplest way to keep parity with DESIGN.md.
const SAGE = '#4A7A5C'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface TranslationReviewItemProps {
  item: AdminTranslation
  // Called after a successful approve / retranslate so the parent can refresh
  // the list (removing the item from "Needs Review", marking it approved, etc).
  onChange: () => void
  // The auth token, threaded through from the page. The item itself doesn't
  // own the session - it's a presentational+state component and the page
  // owns auth.
  onApprove: (id: string, translatedText: string | null) => Promise<void>
  onRetranslate: (id: string) => Promise<void>
}

export default function TranslationReviewItem({
  item,
  onChange,
  onApprove,
  onRetranslate,
}: TranslationReviewItemProps) {
  // The textarea is controlled; we seed it from the backend's translated_text
  // and let the user edit. `hasEdits` drives the "Save edits" button - it
  // only lights up when the live text differs from the original.
  const [text, setText] = useState(item.translated_text)
  const [submitting, setSubmitting] = useState<null | 'approve' | 'save' | 'retranslate'>(null)
  const [error, setError] = useState<string | null>(null)

  const hasEdits = text !== item.translated_text
  const isApproved = item.approved_by !== null

  const badge = TABLE_LABELS[item.table_name] ?? {
    label: item.table_name,
    className: 'bg-muted/15 text-muted',
  }

  async function handleApproveAsIs() {
    if (submitting) return
    setSubmitting('approve')
    setError(null)
    try {
      await onApprove(item.id, null)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setSubmitting(null)
    }
  }

  async function handleSaveEdits() {
    if (submitting || !hasEdits) return
    setSubmitting('save')
    setError(null)
    try {
      await onApprove(item.id, text)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(null)
    }
  }

  async function handleRetranslate() {
    if (submitting) return
    // Destructive: deletes the existing row and re-enqueues. If the user
    // had hand-edited and approved this translation, those edits are lost.
    // Confirm before doing it.
    if (
      !window.confirm(
        'Delete this translation and queue a fresh one? Any human-approved edits will be lost.',
      )
    ) {
      return
    }
    setSubmitting('retranslate')
    setError(null)
    try {
      await onRetranslate(item.id)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retranslate failed')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      {/* Header: record context + table/field badges. The record_title is
          the bilingual reviewer's anchor - tells them which post/page/event
          they're looking at without needing a separate query. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-serif text-base font-semibold text-foreground">
          {item.record_title}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 font-display text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        <span className="rounded-full bg-muted/15 px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
          {item.field_name}
        </span>
        <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-medium text-muted uppercase">
          {item.locale}
        </span>
      </div>

      {/* Two-column diff. Stacks on mobile, side-by-side on md+ - admins
          will mostly review on desktop but mobile is still functional. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block font-display text-[11px] font-semibold uppercase tracking-wider text-muted">
            English source
          </label>
          <div className="min-h-[7rem] whitespace-pre-wrap rounded-lg bg-muted/10 p-3 font-sans text-sm leading-relaxed text-foreground">
            {item.source_text}
          </div>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between font-display text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>Vietnamese translation</span>
            <span className="font-mono text-[10px] normal-case tracking-normal">
              {text.length} chars
            </span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[7rem] w-full resize-y rounded-lg border border-border bg-surface p-3 font-sans text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={submitting !== null}
          />
        </div>
      </div>

      {/* Metadata strip */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-muted">
        <span>Translated {formatDate(item.created_at)}</span>
        <span aria-hidden>·</span>
        <span>{item.is_ai_generated ? 'AI generated' : 'Human edited'}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">{item.table_name}</span>
        {isApproved && item.approved_at && (
          <>
            <span aria-hidden>·</span>
            <span style={{ color: SAGE }} className="font-medium">
              Approved {formatDate(item.approved_at)}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleApproveAsIs}
          disabled={submitting !== null}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-display text-sm font-semibold text-white transition-colors hover:bg-primary-light disabled:opacity-60"
        >
          {submitting === 'approve' ? 'Approving…' : 'Approve as-is'}
        </button>
        <button
          type="button"
          onClick={handleSaveEdits}
          disabled={!hasEdits || submitting !== null}
          style={hasEdits && !submitting ? { backgroundColor: SAGE, color: '#fff' } : undefined}
          className={`inline-flex h-10 items-center rounded-lg px-4 font-display text-sm font-semibold transition-colors disabled:opacity-50 ${
            hasEdits && submitting === null
              ? 'hover:opacity-90'
              : 'border border-border bg-surface text-muted'
          }`}
        >
          {submitting === 'save' ? 'Saving…' : 'Save edits'}
        </button>
        <button
          type="button"
          onClick={handleRetranslate}
          disabled={submitting !== null}
          className="inline-flex h-10 items-center rounded-lg px-3 font-display text-sm font-medium text-muted transition-colors hover:bg-muted/10 hover:text-foreground disabled:opacity-50"
        >
          {submitting === 'retranslate' ? 'Queuing…' : 'Re-translate'}
        </button>
        {error && (
          <span className="font-sans text-xs text-red-600" role="alert">
            {error}
          </span>
        )}
      </div>
    </article>
  )
}

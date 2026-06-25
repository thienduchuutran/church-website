'use client'

import { useState } from 'react'
import type { AdminTranslation, TranslationRecordGroup } from '@/lib/translations'
import { sanitizeBody } from '@/lib/sanitizeBody'
import { useSessionDraft } from '@/lib/use-session-draft'
import { RichContent } from '@/components/editor/RichContent'
import { RichBodyEditor } from '@/components/editor/RichBodyEditor'

// Per-table human labels for the badge in the card header. Fallback at the
// bottom renders an unknown table_name raw so a new content type never breaks
// the panel (it just loses its hand-tuned color).
const TABLE_LABELS: Record<string, { label: string; className: string }> = {
  posts: { label: 'Post', className: 'bg-primary/12 text-primary' },
  page_content: { label: 'Page', className: 'bg-amber-100 text-amber-700' },
  calendar_events: { label: 'Event', className: 'bg-accent/15 text-accent' },
  calendar_month_notes: { label: 'Month note', className: 'bg-emerald-100 text-emerald-700' },
}

// Human label per field name. Anything unlisted shows the raw field_name.
const FIELD_LABELS: Record<string, string> = { title: 'Title', body: 'Body' }

// Sage is the spec's "approved" color - matches the calendar accent. Inline
// because Tailwind 4 purges class names it can't see at build time.
const SAGE = '#4A7A5C'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// tagCounts returns how many times each HTML tag opens in a string. Used for
// the formatting-integrity QA check: a translation that dropped a <a> or <strong>
// almost certainly broke the layout, and machine translation of HTML is exactly
// where that happens (the failure mode every CAT tool guards against).
function tagCounts(html: string): Map<string, number> {
  const counts = new Map<string, number>()
  const re = /<([a-z][a-z0-9]*)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase()
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

// tagMismatch compares the tag profile of source vs target and returns a short
// human message when they differ, or null when they match. Only meaningful for
// rich (body) fields.
function tagMismatch(source: string, target: string): string | null {
  const src = tagCounts(source)
  const tgt = tagCounts(target)
  const tags = new Set([...src.keys(), ...tgt.keys()])
  const diffs: string[] = []
  for (const tag of tags) {
    const a = src.get(tag) ?? 0
    const b = tgt.get(tag) ?? 0
    if (a !== b) diffs.push(`<${tag}> ${a}→${b}`)
  }
  return diffs.length ? `Formatting differs from source: ${diffs.join(', ')}` : null
}

interface TranslationReviewRecordProps {
  group: TranslationRecordGroup
  // Called after a successful approve / retranslate so the parent refreshes.
  onChange: () => void
  // Per-field handlers, threaded from the page (which owns the auth token).
  onApprove: (id: string, translatedText: string | null) => Promise<void>
  onRetranslate: (id: string) => Promise<void>
}

export default function TranslationReviewRecord({
  group,
  onChange,
  onApprove,
  onRetranslate,
}: TranslationReviewRecordProps) {
  // edits maps a field id to the reviewer's working copy of the target text.
  // A field is only "edited" once it appears here AND differs from the AI text.
  // Persisted per record so the reviewer's in-progress edits survive a language
  // switch (which remounts this page) or a refresh - restored automatically.
  const [edits, setEdits, clearEditsDraft] = useSessionDraft<Record<string, string>>(
    `tx-edits:${group.key}`,
    {},
  )
  // Which body fields have the rich editor open. Bodies render read-only by
  // default (one Tiptap instance per open editor is heavy) and mount the editor
  // only on demand.
  const [editingBody, setEditingBody] = useState<Record<string, boolean>>({})
  // busy is 'approve' for the record-level action, or `retranslate:<id>` for a
  // single field, so only the button in flight shows a spinner.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const badge = TABLE_LABELS[group.table_name] ?? {
    label: group.table_name,
    className: 'bg-muted/15 text-muted',
  }

  const targetOf = (f: AdminTranslation) => edits[f.id] ?? f.translated_text
  const isEdited = (f: AdminTranslation) => f.id in edits && edits[f.id] !== f.translated_text
  const anyEdited = group.fields.some(isEdited)
  const allApproved = group.fields.every((f) => f.approved_by !== null)

  function setFieldText(id: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: value }))
  }

  // Approve every field in the record. Edited fields are saved with the
  // reviewer's text (body edits sanitized so the WYSIWYG output can't
  // reintroduce junk markup); untouched fields are approved as-is (null).
  async function handleApproveAll() {
    if (busy) return
    setBusy('approve')
    setError(null)
    try {
      for (const f of group.fields) {
        let text: string | null = null
        if (isEdited(f)) {
          text = f.field_name === 'body' ? sanitizeBody(edits[f.id]) : edits[f.id]
        }
        await onApprove(f.id, text)
      }
      clearEditsDraft() // committed - drop the saved draft
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRetranslate(field: AdminTranslation) {
    if (busy) return
    if (
      !window.confirm(
        `Delete the ${FIELD_LABELS[field.field_name] ?? field.field_name} translation and queue a fresh one? Any human-approved edits to this field will be lost.`,
      )
    ) {
      return
    }
    setBusy(`retranslate:${field.id}`)
    setError(null)
    try {
      await onRetranslate(field.id)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retranslate failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      {/* Header: record context + table/locale badges. record_title is the
          reviewer's anchor - which post/page/event this is. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-serif text-base font-semibold text-foreground">
          {group.record_title}
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 font-display text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-medium uppercase text-muted">
          {group.locale}
        </span>
        {allApproved && (
          <span style={{ color: SAGE }} className="font-display text-xs font-semibold">
            ✓ Approved
          </span>
        )}
      </div>

      {/* One sub-section per field, in reading order (title, then body). */}
      <div className="space-y-5">
        {group.fields.map((field) => {
          const isBody = field.field_name === 'body'
          const target = targetOf(field)
          const fieldApproved = field.approved_by !== null
          const mismatch = isBody ? tagMismatch(field.source_text, target) : null
          const retranslating = busy === `retranslate:${field.id}`

          return (
            <div key={field.id} className="border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-foreground">
                  {FIELD_LABELS[field.field_name] ?? field.field_name}
                </span>
                {fieldApproved && (
                  <span style={{ color: SAGE }} className="font-display text-[10px] font-semibold uppercase">
                    Approved
                  </span>
                )}
                {isEdited(field) && (
                  <span className="font-display text-[10px] font-semibold uppercase text-amber-600">
                    Edited
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRetranslate(field)}
                  disabled={busy !== null}
                  className="ml-auto inline-flex h-7 items-center rounded-md px-2 font-display text-xs font-medium text-muted transition-colors hover:bg-muted/10 hover:text-foreground disabled:opacity-50"
                >
                  {retranslating ? 'Queuing…' : 'Re-translate'}
                </button>
              </div>

              {/* min-w-0 on both columns: grid items default to min-width:auto,
                  which would let a long unbreakable URL stretch the track past
                  the card edge. */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* English source (read-only) */}
                <div className="min-w-0">
                  <label className="mb-1 block font-display text-[11px] font-medium uppercase tracking-wider text-muted">
                    English source
                  </label>
                  {isBody ? (
                    <div className="min-h-[6rem] rounded-lg bg-muted/10 p-3">
                      <RichContent html={field.source_text} className="font-sans text-sm leading-relaxed text-foreground" />
                    </div>
                  ) : (
                    <div className="min-h-[3rem] whitespace-pre-wrap break-words rounded-lg bg-muted/10 p-3 font-sans text-sm leading-relaxed text-foreground">
                      {field.source_text}
                    </div>
                  )}
                </div>

                {/* Vietnamese target (editable) */}
                <div className="min-w-0">
                  <label className="mb-1 flex items-center justify-between font-display text-[11px] font-medium uppercase tracking-wider text-muted">
                    <span>Vietnamese translation</span>
                    {isBody && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingBody((prev) => ({ ...prev, [field.id]: !prev[field.id] }))
                        }
                        className="font-display text-[10px] font-semibold normal-case tracking-normal text-primary hover:underline"
                      >
                        {editingBody[field.id] ? 'Done' : 'Edit'}
                      </button>
                    )}
                  </label>

                  {isBody ? (
                    editingBody[field.id] ? (
                      <RichBodyEditor
                        value={target}
                        onChange={(html) => setFieldText(field.id, html)}
                      />
                    ) : (
                      <div className="min-h-[6rem] rounded-lg border border-border bg-surface p-3">
                        <RichContent html={target} className="font-sans text-sm leading-relaxed text-foreground" />
                      </div>
                    )
                  ) : (
                    <textarea
                      value={target}
                      onChange={(e) => setFieldText(field.id, e.target.value)}
                      className="min-h-[3rem] w-full resize-y rounded-lg border border-border bg-surface p-3 font-sans text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      disabled={busy !== null}
                    />
                  )}

                  {mismatch && (
                    <p className="mt-1.5 font-sans text-xs text-amber-700" role="alert">
                      ⚠ {mismatch}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Metadata strip - uses the newest field's timestamps as the record's. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-muted">
        <span>Translated {formatDate(group.fields[0].created_at)}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">{group.table_name}</span>
      </div>

      {/* Record-level actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleApproveAll}
          disabled={busy !== null}
          style={anyEdited && !busy ? { backgroundColor: SAGE, color: '#fff' } : undefined}
          className={`inline-flex h-10 items-center rounded-lg px-4 font-display text-sm font-semibold transition-colors disabled:opacity-60 ${
            anyEdited && busy === null ? 'hover:opacity-90' : 'bg-primary text-white hover:bg-primary-light'
          }`}
        >
          {busy === 'approve'
            ? 'Approving…'
            : anyEdited
              ? 'Save edits & approve all'
              : 'Approve all'}
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

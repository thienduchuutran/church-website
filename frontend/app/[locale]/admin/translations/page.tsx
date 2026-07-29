'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  approveTranslation,
  cleanupOrphanTranslations,
  dismissTranslation,
  groupAdminTranslations,
  listAdminTranslations,
  retranslateAllTranslations,
  retranslateTranslation,
  type AdminTranslation,
} from '@/lib/translations'
import TranslationReviewRecord from '@/components/features/admin/TranslationReviewRecord'
import { useConfirm } from '@/lib/confirm'

// Filter tab state matches the backend's tri-state `approved` query param:
//   needs-review → approved=false   (default, the most common task)
//   approved     → approved=true
//   all          → omit the param
type Tab = 'needs-review' | 'approved' | 'all'

const TABS: { value: Tab; label: string }[] = [
  { value: 'needs-review', label: 'Needs Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'All' },
]

const PAGE_SIZE = 20

function approvedFilterFor(tab: Tab): boolean | undefined {
  if (tab === 'needs-review') return false
  if (tab === 'approved') return true
  return undefined
}

export default function AdminTranslationsPage() {
  const { session, isAdmin, loading, signIn } = useAuth()
  const token = session?.access_token ?? null

  const [tab, setTab] = useState<Tab>('needs-review')
  const [items, setItems] = useState<AdminTranslation[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bulk retranslate state. `bulkBusy` doubles as the button's loading flag
  // and the disable-while-running guard. `bulkMessage` shows the result count
  // for a few seconds after success so the reviewer sees confirmation.
  const confirm = useConfirm()
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  // Orphan cleanup gets its own busy flag (so one slow operation doesn't lock
  // the other button) but shares the bulkMessage status line - there's only
  // ever one result the reviewer cares about at a time.
  const [orphanBusy, setOrphanBusy] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Group the flat per-field rows into per-record "documents" so a post's title
  // and body are reviewed together. Pagination stays row-based on the backend;
  // at current scale a record's fields are enqueued together and land on the
  // same page, so grouping the fetched page is reliable.
  const groups = groupAdminTranslations(items)

  // load is exposed so child items can call it after approve/retranslate to
  // refresh the list - simpler than tracking per-item state and rebuilding.
  // Wrapped in useCallback so the effect dependency stays stable across
  // re-renders (we only want to refetch on token/tab/page changes).
  const load = useCallback(async () => {
    if (!token) return
    setListLoading(true)
    setError(null)
    try {
      const data = await listAdminTranslations(
        {
          approved: approvedFilterFor(tab),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
        token,
      )
      setItems(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations')
    } finally {
      setListLoading(false)
    }
  }, [token, tab, page])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  // Switching tabs resets to page 0 - showing page 3 of "Needs Review" when
  // the user clicks "Approved" would be confusing if the new tab only has
  // one page of results.
  function handleTabChange(next: Tab) {
    if (next === tab) return
    setTab(next)
    setPage(0)
  }

  // Wrap the API helpers with the token in scope so the item component
  // doesn't need to know about auth. Same pattern as the admin dashboard's
  // delete-post flow.
  const handleApprove = useCallback(
    async (id: string, translatedText: string | null) => {
      if (!token) throw new Error('not signed in')
      await approveTranslation(id, translatedText, token)
    },
    [token],
  )

  const handleRetranslate = useCallback(
    async (id: string) => {
      if (!token) throw new Error('not signed in')
      await retranslateTranslation(id, token)
    },
    [token],
  )

  const handleDismiss = useCallback(
    async (id: string) => {
      if (!token) throw new Error('not signed in')
      await dismissTranslation(id, token)
    },
    [token],
  )

  // Bulk re-translate. Destructive: every unapproved row is deleted and
  // re-queued. We confirm with a sentence that makes the consequence
  // unambiguous - the reviewer's approved edits are the obvious thing they'd
  // worry about losing, so we name that explicitly in the prompt.
  async function handleRetranslateAll() {
    if (!token || bulkBusy) return
    const ok = await confirm({
      title: 'Re-queue every unapproved translation?',
      message:
        'All unapproved translations are deleted and re-queued with the current system prompt. Approved (human-reviewed) translations are left untouched.',
      confirmLabel: 'Re-queue all',
      tone: 'danger',
    })
    if (!ok) return
    setBulkBusy(true)
    setBulkMessage(null)
    setError(null)
    try {
      const { requeued } = await retranslateAllTranslations(token)
      setBulkMessage(`Re-queued ${requeued} translation${requeued === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk retranslate failed')
    } finally {
      setBulkBusy(false)
    }
  }

  // Orphan cleanup. Destructive but narrow: only translations whose parent
  // record was already deleted (the "posts:a1b2c3d4"-labeled rows). The
  // confirm names exactly what is removed so the reviewer never wonders if
  // live translations are at risk.
  async function handleCleanupOrphans() {
    if (!token || orphanBusy) return
    const ok = await confirm({
      title: 'Clean up orphaned translations?',
      message:
        'Deletes translations whose source post, page or event no longer exists. Translations for existing content - approved or pending - are not touched.',
      confirmLabel: 'Clean up',
      tone: 'danger',
    })
    if (!ok) return
    setOrphanBusy(true)
    setBulkMessage(null)
    setError(null)
    try {
      const { deleted_translations, deleted_jobs } = await cleanupOrphanTranslations(token)
      setBulkMessage(
        deleted_translations === 0 && deleted_jobs === 0
          ? 'No orphans found.'
          : `Removed ${deleted_translations} orphaned translation${deleted_translations === 1 ? '' : 's'}${deleted_jobs > 0 ? ` and ${deleted_jobs} stale job${deleted_jobs === 1 ? '' : 's'}` : ''}.`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Orphan cleanup failed')
    } finally {
      setOrphanBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Admin Access</h1>
        <p className="font-sans text-muted">Sign in to review translations.</p>
        <button
          type="button"
          onClick={signIn}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Not Authorized</h1>
        <p className="font-sans text-muted">
          Your account ({session.user.email}) is not in the admin whitelist.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-bold text-foreground">Translation Review</h1>
        <span className="font-sans text-sm text-muted">{session.user.email}</span>
      </div>

      {/* Prompt-versioning action row. The button lives here (not buried in
          per-row actions) because it's a project-wide operation tied to the
          prompt-iteration workflow: edit prompts/*.md → sync-prompt.sh → click
          this. The helper text explains the "approved rows are sacred" rule
          since it's the surprising part - reviewers shouldn't have to read the
          confirm dialog to learn it. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-4 py-3">
        {bulkMessage && (
          <span className="font-sans text-xs font-medium text-emerald-700" role="status">
            {bulkMessage}
          </span>
        )}
        <button
          type="button"
          onClick={handleRetranslateAll}
          disabled={bulkBusy}
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
        >
          {bulkBusy ? 'Re-queuing…' : 'Re-translate all pending'}
        </button>
        <button
          type="button"
          onClick={handleCleanupOrphans}
          disabled={orphanBusy}
          title="Remove translations whose source post/page/event has been deleted (shown with table:id labels)"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50"
        >
          {orphanBusy ? 'Cleaning…' : 'Clean up orphans'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ value, label }) => {
          const active = tab === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleTabChange(value)}
              aria-pressed={active}
              className={`-mb-px border-b-2 px-4 py-2 font-display text-sm font-medium transition-colors ${active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground'
                }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Result count + page indicator. Total updates with the filter so the
          reviewer can see the queue depth at a glance. */}
      <div className="mb-4 font-sans text-xs text-muted">
        {listLoading ? (
          <span>Loading…</span>
        ) : (
          <>
            {total} {total === 1 ? 'field' : 'fields'}
            {groups.length > 0 && (
              <>
                {' · '}
                {groups.length} {groups.length === 1 ? 'record' : 'records'} on this page
              </>
            )}
            {totalPages > 1 && (
              <>
                {' · '}Page {page + 1} of {totalPages}
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Items list */}
      {!listLoading && items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-16 text-center">
          {/* Easter egg per spec: Vietnamese + English mix - because the
              reviewers ARE bilingual and we want them to smile when the
              queue is empty. Translates roughly to "All done!". */}
          <p className="font-serif text-xl text-foreground">
            {tab === 'needs-review'
              ? 'Hết rồi! No translations pending review.'
              : tab === 'approved'
                ? 'No approved translations yet.'
                : 'No translations in the database yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <TranslationReviewRecord
              key={group.key}
              group={group}
              onChange={load}
              onApprove={handleApprove}
              onRetranslate={handleRetranslate}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || listLoading}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:border-border"
          >
            ← Previous
          </button>
          <span className="font-sans text-sm text-muted">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages || listLoading}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:border-border"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

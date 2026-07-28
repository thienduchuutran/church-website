'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import { useRegisterUnsaved } from '@/lib/unsaved-changes'
import { getPageContent, replacePageBlocks, type PageBlock, type PageBlockType } from '@/lib/pages'
import { RichBodyEditor } from '@/components/editor/RichBodyEditor'

// EditorBlock is a PageBlock plus a client-only `key`. React needs a stable
// identity for list items, and a brand-new block has no server `id` yet - so
// the key cannot be the id. Keeping them separate is what lets a new block be
// reordered and edited before it has ever been saved.
interface EditorBlock {
  key: string
  id?: string
  block_type: PageBlockType
  title: string
  content: string
  props: Record<string, unknown>
}

// BLOCK_META is the editor-side half of the block registry (the renderer holds
// the other half). Adding a block type means one entry here, one renderer, and
// one string in the Go allow-list - never a new page template.
const BLOCK_META: Record<PageBlockType, { label: string; hint: string; addable: boolean }> = {
  hero: {
    label: 'Page header',
    hint: 'The big title and tagline at the top of the page. Every page has exactly one.',
    addable: false,
  },
  rich_text: {
    label: 'Text section',
    hint: 'A heading plus body copy. Use the toolbar for bullets, numbering and indenting.',
    addable: true,
  },
  quote: {
    label: 'Quote',
    hint: 'A pulled-out verse or testimony, with an optional attribution line.',
    addable: true,
  },
}

const ADDABLE_TYPES = (Object.keys(BLOCK_META) as PageBlockType[]).filter(
  (t) => BLOCK_META[t].addable,
)

function newKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random()}`
}

function toEditorBlock(b: PageBlock): EditorBlock {
  return {
    key: newKey(),
    id: b.id,
    block_type: b.block_type,
    title: b.title,
    content: b.content,
    props: b.props ?? {},
  }
}

function emptyBlock(type: PageBlockType): EditorBlock {
  return { key: newKey(), block_type: type, title: '', content: '', props: {} }
}

// readString pulls a string out of the untyped props bag. props is deliberately
// schemaless (it is the escape hatch for per-type config), so every read has to
// defend against the value being absent or the wrong shape.
function readString(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v : ''
}

const inputClass =
  'block w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none'

const iconBtnClass =
  'rounded-md border border-border px-2 py-1 font-display text-xs text-muted transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-30'

export default function PageBlockEditor({ slug }: { slug: string }) {
  const { session } = useAuth()
  const router = useRouter()

  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  // The snapshot of what the server last confirmed, used purely for dirty
  // detection. Comparing serialized state beats a manual `dirty` flag: editing
  // a field then undoing the edit correctly reports "not dirty".
  const [saved, setSaved] = useState<string>('[]')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // serialize strips the client-only `key` so a reload that mints fresh keys
  // does not register as an unsaved change.
  const serialize = useCallback(
    (list: EditorBlock[]) =>
      JSON.stringify(
        list.map(({ id, block_type, title, content, props }) => ({
          id,
          block_type,
          title,
          content,
          props,
        })),
      ),
    [],
  )

  const current = useMemo(() => serialize(blocks), [blocks, serialize])
  const dirty = !loading && current !== saved

  useRegisterUnsaved(`page-blocks:${slug}`, dirty)

  // load pulls the English source. No locale param on purpose - admins edit the
  // source language and the worker fans translations out afterwards.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPageContent(slug)
      let next = data.blocks.map(toEditorBlock)
      // A page with no header block cannot render a title, so seed one rather
      // than making the admin work out that it is missing.
      if (!next.some((b) => b.block_type === 'hero')) {
        next = [emptyBlock('hero'), ...next]
      }
      setBlocks(next)
      setSaved(serialize(next))
    } catch {
      const seeded = [emptyBlock('hero')]
      setBlocks(seeded)
      setSaved(serialize(seeded))
    } finally {
      setLoading(false)
    }
  }, [slug, serialize])

  useEffect(() => {
    void load()
  }, [load])

  // The header block is pinned to index 0 and cannot be moved or deleted, so
  // everything below is the movable range.
  const firstMovable = blocks.findIndex((b) => b.block_type !== 'hero')
  const minIndex = firstMovable === -1 ? blocks.length : firstMovable

  function patch(key: string, changes: Partial<EditorBlock>) {
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...changes } : b)))
    setSuccess(false)
  }

  function addBlock(type: PageBlockType) {
    setBlocks((prev) => [...prev, emptyBlock(type)])
    setSuccess(false)
  }

  function removeBlock(index: number) {
    const b = blocks[index]
    const name = b.title.trim() || BLOCK_META[b.block_type].label
    // Removal is destructive on save - the row and its Vietnamese translations
    // are deleted server-side - so it gets an explicit confirm.
    if (!window.confirm(`Remove "${name}"? Its translations are deleted when you save.`)) return
    setBlocks((prev) => prev.filter((_, i) => i !== index))
    setSuccess(false)
  }

  function moveBlock(index: number, delta: number) {
    const target = index + delta
    if (target < minIndex || target >= blocks.length) return
    setBlocks((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
    setSuccess(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      await replacePageBlocks(
        slug,
        blocks.map(({ id, block_type, title, content, props }) => ({
          id,
          block_type,
          title,
          content,
          props,
        })),
        session.access_token,
      )
      // Refetch rather than trusting local state: newly inserted blocks only
      // get their row UUID server-side. Without this, a second save would send
      // them with an empty id again and insert duplicates.
      await load()
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (dirty && !window.confirm('You have unsaved changes that will be lost. Continue?')) return
    router.push('/admin')
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-sans text-muted">Loading content...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Edit About Page</h1>
      <p className="mb-8 font-sans text-sm text-muted">
        Add, remove and reorder the sections of this page. Changes go live for everyone once you
        save, and the Vietnamese translation follows a few seconds later.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {blocks.map((block, index) => {
          const meta = BLOCK_META[block.block_type]
          const isHero = block.block_type === 'hero'
          const locked = index < minIndex

          return (
            <fieldset
              key={block.key}
              className="space-y-4 rounded-xl border border-border bg-surface/30 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
                  {meta.label}
                </legend>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveBlock(index, -1)}
                    disabled={locked || index <= minIndex}
                    className={iconBtnClass}
                    aria-label={`Move ${meta.label} up`}
                    title="Move up"
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(index, 1)}
                    disabled={locked || index >= blocks.length - 1}
                    className={iconBtnClass}
                    aria-label={`Move ${meta.label} down`}
                    title="Move down"
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    disabled={locked}
                    className={`${iconBtnClass} hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                    aria-label={`Remove ${meta.label}`}
                    title={locked ? 'The page header cannot be removed' : 'Remove section'}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <p className="font-sans text-xs text-muted">{meta.hint}</p>

              {/* Quote blocks have no heading - the quote itself is the content. */}
              {block.block_type !== 'quote' && (
                <div>
                  <label
                    htmlFor={`${block.key}-title`}
                    className="mb-1 block font-display text-sm font-medium text-foreground"
                  >
                    {isHero ? 'Page title' : 'Heading'}
                  </label>
                  <input
                    id={`${block.key}-title`}
                    type="text"
                    value={block.title}
                    onChange={(e) => patch(block.key, { title: e.target.value })}
                    className={inputClass}
                    placeholder={isHero ? 'About Our Church' : 'Our Mission'}
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor={`${block.key}-content`}
                  className="mb-1 block font-display text-sm font-medium text-foreground"
                >
                  {isHero ? 'Tagline' : block.block_type === 'quote' ? 'Quote' : 'Body'}
                </label>
                {/* The header tagline is a single plain line by design - it sits
                    under an <h1> and rich markup there would fight the layout. */}
                {isHero ? (
                  <input
                    id={`${block.key}-content`}
                    type="text"
                    value={block.content}
                    onChange={(e) => patch(block.key, { content: e.target.value })}
                    className={inputClass}
                    placeholder="A one-line tagline that captures who you are"
                  />
                ) : (
                  <RichBodyEditor
                    variant="lite"
                    value={block.content}
                    onChange={(html) => patch(block.key, { content: html })}
                    ariaLabel={`${meta.label} body`}
                    placeholder={
                      block.block_type === 'quote'
                        ? 'For God so loved the world…'
                        : 'Write this section…'
                    }
                  />
                )}
              </div>

              {block.block_type === 'quote' && (
                <div>
                  <label
                    htmlFor={`${block.key}-attribution`}
                    className="mb-1 block font-display text-sm font-medium text-foreground"
                  >
                    Attribution <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id={`${block.key}-attribution`}
                    type="text"
                    value={readString(block.props, 'attribution')}
                    onChange={(e) =>
                      patch(block.key, { props: { ...block.props, attribution: e.target.value } })
                    }
                    className={inputClass}
                    placeholder="John 3:16"
                  />
                </div>
              )}
            </fieldset>
          )
        })}

        {/* Add row. The type list comes from BLOCK_META, so a new block type
            appears here automatically once it is registered. */}
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="mb-3 font-display text-sm font-medium text-foreground">Add a section</p>
          <div className="flex flex-wrap gap-2">
            {ADDABLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className="rounded-lg border border-border bg-surface px-4 py-2 font-display text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                + {BLOCK_META[type].label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700">
            Page saved. Vietnamese translations will catch up in a few seconds.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-border px-5 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-surface"
          >
            Back to Admin
          </button>
          {dirty && (
            <span className="font-sans text-xs text-muted" role="status">
              Unsaved changes
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

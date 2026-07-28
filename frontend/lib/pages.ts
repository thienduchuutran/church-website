import { apiGet, apiPut } from './api'
import { sanitizeBody } from './sanitizeBody'

// PageBlockType is the closed set of block types the backend accepts
// (model.AllowedBlockTypes in Go) and the public page knows how to render.
// Keeping it a union means adding a type is a compile error everywhere it
// needs handling, rather than a silently-unrendered block.
export type PageBlockType = 'hero' | 'rich_text' | 'quote'

// PageBlock mirrors Go's model.PageBlock. `id` is the row UUID and the block's
// stable identity - it survives reordering and retitling, which is what keeps
// translations attached to the right block.
export interface PageBlock {
  id?: string
  block_type: PageBlockType
  position: number
  title: string
  content: string
  props: Record<string, unknown>
  machine_translated?: boolean
}

// PageContentResponse mirrors the Go backend's response for GET /pages/:slug.
// The endpoint returns two projections of the same rows: `sections` (flat
// key-value, used by Connect) and `blocks` (ordered typed array, used by
// About). `machine_translated` is omitted on English responses (Go's
// omitempty), so callers should treat `undefined` as `false` - the badge only
// renders on explicit `true`.
export interface PageContentResponse {
  sections: Record<string, string>
  blocks: PageBlock[]
  machine_translated?: boolean
}

// getPageContent reads a static page's sections from the backend. Accepts an
// optional locale so /vi/about gets Vietnamese content via the translation
// engine's COALESCE join; English requests bypass the join entirely. The
// fallback defaults are merged in at the page layer, not here, so this
// function stays a thin transport wrapper.
export async function getPageContent(slug: string, locale?: string): Promise<PageContentResponse> {
  const qs = locale && locale !== 'en' ? `?locale=${encodeURIComponent(locale)}` : ''
  const data = (await apiGet(`/api/v1/pages/${slug}${qs}`)) as PageContentResponse | undefined
  return {
    sections: data?.sections ?? {},
    blocks: data?.blocks ?? [],
    machine_translated: data?.machine_translated,
  }
}

// updatePageContent is the admin write path. No locale param: admins edit
// the English source; the worker fans translations out afterwards.
export async function updatePageContent(
  slug: string,
  sections: Record<string, string>,
  token: string,
): Promise<void> {
  await apiPut(`/api/v1/pages/${slug}`, { sections }, token)
}

// PageBlockInput is what the admin sends back. `position` is omitted on
// purpose: the backend derives it from array order, so the client cannot
// desync order and index.
export interface PageBlockInput {
  id?: string
  block_type: PageBlockType
  title: string
  content: string
  props: Record<string, unknown>
}

// An "empty" Tiptap document still serializes to a paragraph tag. Storing that
// would render a blank gap on the public page and enqueue a translation job for
// nothing, so it is normalized to a true empty string on the way out.
const EMPTY_HTML = /^\s*(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)*$/i

function normalizeBody(html: string): string {
  const clean = sanitizeBody(html)
  return EMPTY_HTML.test(clean) ? '' : clean
}

// replacePageBlocks is a FULL REPLACE, not a patch. Blocks absent from the
// array are deleted server-side along with their translations - that is what
// makes "remove this section" work. Always send the complete list.
//
// Content is sanitized here as well as on render: the same allow-list runs on
// both paths so what is stored can never be richer than what is displayed.
export async function replacePageBlocks(
  slug: string,
  blocks: PageBlockInput[],
  token: string,
): Promise<void> {
  const payload = blocks.map((b) => ({
    ...b,
    id: b.id ?? '',
    title: b.title.trim(),
    // The hero tagline is a plain text input, not editor HTML - sanitizing it
    // is harmless, but the empty-document normalization only applies to bodies
    // that actually came from Tiptap.
    content: b.block_type === 'hero' ? b.content.trim() : normalizeBody(b.content),
  }))
  await apiPut(`/api/v1/pages/${slug}`, { blocks: payload }, token)
}

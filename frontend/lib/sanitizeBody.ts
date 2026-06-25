import DOMPurify from 'isomorphic-dompurify'

// Single source of truth for what HTML is allowed inside a post/page body.
// Applied on all three paths so the pasted, stored, and rendered markup can
// never drift apart:
//   - paste into the editor      -> RichBodyEditor transformPastedHTML
//   - save to the API            -> lib/posts.ts create/update
//   - render on the public site  -> RichContent
//
// Tag/attr lists mirror what the Tiptap editor actually emits (StarterKit +
// Underline/Link/Highlight/Color/TextAlign + the CalloutBlock div).
export const BODY_ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'br', 'strong', 'em', 'u', 's', 'mark', 'a',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'div', 'span',
]

export const BODY_ALLOWED_ATTR = [
  'href', 'target', 'rel', 'class', 'data-callout', 'data-callout-variant', 'style',
]

// The ONLY CSS properties allowed to survive on a style="" attribute. The
// editor's TextAlign extension stores alignment as inline `text-align`, so we
// keep that - but every other inline style is dropped. That includes the
// `color: oklab(...)` spans pasted from Planning Center / Gmail / other sites,
// which is the tag-soup the translation reviewers were seeing.
const ALLOWED_STYLE_PROPS = new Set(['text-align'])

// DOMPurify hooks live on the shared singleton, so install exactly once.
let hookInstalled = false
function ensureStyleHook(): void {
  if (hookInstalled) return
  hookInstalled = true
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return
    const kept = data.attrValue
      .split(';')
      .map((decl) => decl.trim())
      .filter(Boolean)
      .filter((decl) => {
        const prop = decl.split(':')[0]?.trim().toLowerCase()
        return prop !== undefined && ALLOWED_STYLE_PROPS.has(prop)
      })
      .join('; ')
    if (kept) {
      data.attrValue = kept
    } else {
      // Nothing survived - drop the attribute so we never leave empty
      // style="" noise behind.
      data.keepAttr = false
    }
  })
}

// sanitizeBody returns body HTML containing only the allowed tags/attributes,
// with every inline style except text-align removed. Safe to call in the
// browser and on the server (isomorphic-dompurify picks the right backend).
export function sanitizeBody(html: string): string {
  ensureStyleHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: BODY_ALLOWED_TAGS,
    ALLOWED_ATTR: BODY_ALLOWED_ATTR,
    FORCE_BODY: false,
  })
}

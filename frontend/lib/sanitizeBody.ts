import sanitizeHtml from 'sanitize-html'

// Single source of truth for what HTML is allowed inside a post/page body.
// Applied on all three paths so the pasted, stored, and rendered markup can
// never drift apart:
//   - paste into the editor      -> RichBodyEditor transformPastedHTML
//   - save to the API            -> lib/posts.ts create/update
//   - render on the public site  -> RichContent
//
// Implemented with sanitize-html (a string/parser-based sanitizer) rather than
// DOMPurify on purpose: DOMPurify needs a DOM, so on the server it pulls in
// jsdom, whose ESM dependency chain crashes Vercel's serverless runtime with
// ERR_REQUIRE_ESM. sanitize-html parses the HTML directly, so the exact same
// code runs safely in the browser and on the server with no jsdom.
//
// Tag/attr lists mirror what the Tiptap editor actually emits (StarterKit +
// Underline/Link/Highlight/Color/TextAlign + the CalloutBlock div).
export const BODY_ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'br', 'strong', 'em', 'u', 's', 'mark', 'a',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'div', 'span',
]

// Attributes kept on any tag. href/target/rel are flat (allowed on every tag,
// matching the previous DOMPurify ALLOWED_ATTR) so a Tiptap <a> keeps its link
// and the safe-rel hardening it already carries.
export const BODY_ALLOWED_ATTR = [
  'href', 'target', 'rel', 'class', 'data-callout', 'data-callout-variant', 'style',
]

// sanitizeBody returns body HTML containing only the allowed tags/attributes,
// with every inline style except text-align removed (the TextAlign extension
// stores alignment as inline `text-align`; every other inline style - e.g. the
// `color: oklab(...)` spans pasted from Planning Center / Gmail - is dropped).
// Safe to call in the browser and on the server.
export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: BODY_ALLOWED_TAGS,
    // '*' applies the same attribute allow-list to every tag, mirroring the
    // previous flat ALLOWED_ATTR list.
    allowedAttributes: {
      '*': BODY_ALLOWED_ATTR,
    },
    // The ONLY CSS property allowed to survive on a style="" attribute. Any
    // style declaration whose value does not match is dropped; a style="" with
    // nothing left is removed entirely.
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
      },
    },
    // Strip dangerous URL schemes (javascript:, data:, etc.) on links; keep the
    // schemes the editor actually produces.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Keep the text content of any disallowed tag instead of nuking it, matching
    // DOMPurify's KEEP_CONTENT default.
    disallowedTagsMode: 'discard',
  })
}

// htmlToText strips ALL markup and returns just the text content. Used for
// text-only measurements like the reading-time word count, where the tags are
// noise. Allowing no tags makes sanitize-html discard every element but keep
// its inner text.
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
}

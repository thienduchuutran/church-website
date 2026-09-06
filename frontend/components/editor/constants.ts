import type { Editor } from '@tiptap/react'

export const CALLOUT_VARIANTS = {
  // CSS values, not literal hexes: they resolve against the palette tokens in
  // globals.css, so a rebrand is a token edit and these never drift. `color`
  // doubles as the label text, so it is always one of the AA-safe magentas;
  // rose and lavender only show up as the tinted background.
  announcement: { icon: '📣', label: 'Announcement',   color: 'var(--primary)',       bg: 'color-mix(in srgb, var(--primary) 10%, var(--surface))' },
  prayer:        { icon: '🙏', label: 'Prayer Request', color: 'var(--accent)',        bg: 'color-mix(in srgb, var(--accent) 10%, var(--surface))' },
  scripture:     { icon: '📖', label: 'Scripture',      color: 'var(--primary-light)', bg: 'color-mix(in srgb, var(--secondary) 14%, var(--surface))' },
  callout:       { icon: '✨', label: 'Callout',        color: 'var(--primary-light)', bg: 'color-mix(in srgb, var(--panel) 30%, var(--surface))' },
} as const

export type CalloutVariant = keyof typeof CALLOUT_VARIANTS

export const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

export interface SlashItem {
  group: string
  icon: string
  label: string
  desc: string
  action: (editor: Editor) => void
  church?: boolean
  // image items open the editor's file picker instead of running `action`
  // (the upload needs the auth token, which lives in RichBodyEditor).
  image?: boolean
}

export const SLASH_ITEMS: SlashItem[] = [
  // Text
  { group: 'Text',    icon: '¶',    label: 'Paragraph',      desc: 'Default text block',    action: (e) => e.chain().focus().setParagraph().run() },
  { group: 'Text',    icon: 'H1',   label: 'Heading 1',      desc: 'Large section title',   action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { group: 'Text',    icon: 'H2',   label: 'Heading 2',      desc: 'Medium section title',  action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { group: 'Text',    icon: 'H3',   label: 'Heading 3',      desc: 'Small section title',   action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  // Lists
  { group: 'Lists',   icon: '•',    label: 'Bullet List',    desc: 'Unordered list',        action: (e) => e.chain().focus().toggleBulletList().run() },
  { group: 'Lists',   icon: '1.',   label: 'Numbered List',  desc: 'Ordered list',          action: (e) => e.chain().focus().toggleOrderedList().run() },
  // Content
  { group: 'Content', icon: '❝',   label: 'Quote',          desc: 'Block quotation',       action: (e) => e.chain().focus().toggleBlockquote().run() },
  { group: 'Content', icon: '</>',  label: 'Code Block',     desc: 'Preformatted code',     action: (e) => e.chain().focus().toggleCodeBlock().run() },
  { group: 'Content', icon: '-',    label: 'Divider',        desc: 'Horizontal rule',       action: (e) => e.chain().focus().setHorizontalRule().run() },
  { group: 'Content', icon: '🖼',  label: 'Image',          desc: 'Upload from your device', action: () => {}, image: true },
  // Church
  { group: 'Church',  icon: '📣',  label: 'Announcement',   desc: 'Church announcement',   action: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { variant: 'announcement' } }).run(), church: true },
  { group: 'Church',  icon: '🙏',  label: 'Prayer Request', desc: 'Prayer highlight',      action: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { variant: 'prayer' } }).run(), church: true },
  { group: 'Church',  icon: '📖',  label: 'Scripture',      desc: 'Bible verse embed',     action: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { variant: 'scripture' } }).run(), church: true },
  { group: 'Church',  icon: '✨',  label: 'Callout',        desc: 'General highlight box', action: (e) => e.chain().focus().insertContent({ type: 'calloutBlock', attrs: { variant: 'callout' } }).run(), church: true },
]

'use client'

import type { Editor } from '@tiptap/react'
import { CALLOUT_VARIANTS } from '../constants'
import styles from '../RichBodyEditor.module.css'

interface PersistentToolbarProps {
  editor: Editor | null
  onEmojiClick?: () => void
  onImageClick?: () => void
  // 'full' is the post composer. 'lite' is the page-section editor - the same
  // component with fewer controls, so the two toolbars can never drift apart
  // the way two copied files would.
  variant?: 'full' | 'lite'
}

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#fecaca', label: 'Pink' },
]

const TEXT_ALIGNS = [
  { align: 'left',    icon: '⬅' },
  { align: 'center',  icon: '⬛' },
  { align: 'right',   icon: '➡' },
]

// Heading levels offered per variant. Lite starts at H3 on purpose: on the
// public page a block's title already renders as <h2>, so an in-body H1 or H2
// would break the document outline for screen readers and search engines.
const HEADING_LEVELS: Record<'full' | 'lite', number[]> = {
  full: [1, 2, 3],
  lite: [3, 4],
}

export function PersistentToolbar({
  editor,
  onEmojiClick,
  onImageClick,
  variant = 'full',
}: PersistentToolbarProps) {
  if (!editor) return null

  const isFull = variant === 'full'
  const levels = HEADING_LEVELS[variant]

  const currentLevel: number =
    [1, 2, 3, 4].find((l) => editor.isActive('heading', { level: l })) ?? 0

  function setHeading(level: number) {
    if (level === 0) editor!.chain().focus().setParagraph().run()
    else editor!.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run()
  }

  // Prompt-based link editing: the lite editor has no bubble toolbar, so this
  // is the only way to attach a link there. Clicking with a link already active
  // removes it, which is the behaviour people expect from a single toggle.
  function toggleLink() {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('Link URL (https://…)')
    if (!url) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Text formatting options">
      {/* Heading picker */}
      <select
        value={currentLevel}
        onChange={(e) => setHeading(parseInt(e.target.value))}
        className={styles.headingSelect}
        aria-label="Heading level"
      >
        <option value={0}>Text</option>
        {levels.map((l) => (
          <option key={l} value={l}>H{l}</option>
        ))}
      </select>

      <span className={styles.toolbarDivider} aria-hidden />

      {/* Bold */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${styles.toolBtn} ${editor.isActive('bold') ? styles.toolBtnActive : ''}`}
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>

      {/* Italic */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${styles.toolBtn} ${editor.isActive('italic') ? styles.toolBtnActive : ''}`}
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>

      {/* Underline */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`${styles.toolBtn} ${editor.isActive('underline') ? styles.toolBtnActive : ''}`}
        aria-label="Underline"
        aria-pressed={editor.isActive('underline')}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>

      {/* Strike - desktop only */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`${styles.toolBtn} ${styles.desktopOnly} ${editor.isActive('strike') ? styles.toolBtnActive : ''}`}
        aria-label="Strikethrough"
        aria-pressed={editor.isActive('strike')}
        title="Strikethrough"
      >
        <s>S</s>
      </button>

      <span className={styles.toolbarDivider} aria-hidden />

      {/* Bullet list */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${styles.toolBtn} ${editor.isActive('bulletList') ? styles.toolBtnActive : ''}`}
        aria-label="Bullet list"
        aria-pressed={editor.isActive('bulletList')}
        title="Bullet List"
      >
        •&equiv;
      </button>

      {/* Ordered list - desktop only in the full composer, always visible in
          lite because bulleted/numbered lists are the whole point there. */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${styles.toolBtn} ${isFull ? styles.desktopOnly : ''} ${editor.isActive('orderedList') ? styles.toolBtnActive : ''}`}
        aria-label="Numbered list"
        aria-pressed={editor.isActive('orderedList')}
        title="Numbered List"
      >
        1.&equiv;
      </button>

      {/* Indent / outdent. Inside a list these nest and un-nest the item;
          on a plain paragraph they shift it by one indent step. */}
      <button
        type="button"
        onClick={() =>
          editor.isActive('listItem')
            ? editor.chain().focus().sinkListItem('listItem').run()
            : editor.chain().focus().indent().run()
        }
        className={styles.toolBtn}
        aria-label="Increase indent"
        title="Indent (Ctrl+])"
      >
        &#8594;|
      </button>
      <button
        type="button"
        onClick={() =>
          editor.isActive('listItem')
            ? editor.chain().focus().liftListItem('listItem').run()
            : editor.chain().focus().outdent().run()
        }
        className={styles.toolBtn}
        aria-label="Decrease indent"
        title="Outdent (Ctrl+[)"
      >
        |&#8592;
      </button>

      {/* Link - lite only. The full composer has autolink plus the bubble
          toolbar, so it does not need a persistent button. */}
      {!isFull && (
        <button
          type="button"
          onClick={toggleLink}
          className={`${styles.toolBtn} ${editor.isActive('link') ? styles.toolBtnActive : ''}`}
          aria-label={editor.isActive('link') ? 'Remove link' : 'Add link'}
          aria-pressed={editor.isActive('link')}
          title={editor.isActive('link') ? 'Remove link' : 'Add link'}
        >
          &#128279;
        </button>
      )}

      {/* Blockquote + code block - full only. A page section that wants to be a
          quotation uses the `quote` block type instead, and code blocks have no
          place in church page copy. */}
      {isFull && (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`${styles.toolBtn} ${styles.desktopOnly} ${editor.isActive('blockquote') ? styles.toolBtnActive : ''}`}
            aria-label="Block quote"
            aria-pressed={editor.isActive('blockquote')}
            title="Block Quote"
          >
            &#10077;
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`${styles.toolBtn} ${styles.desktopOnly} ${editor.isActive('codeBlock') ? styles.toolBtnActive : ''}`}
            aria-label="Code block"
            aria-pressed={editor.isActive('codeBlock')}
            title="Code Block"
          >
            &lt;/&gt;
          </button>
        </>
      )}

      {/* Highlight colors - full only (the lite editor omits the Highlight
          extension entirely, so these commands would be no-ops). */}
      {isFull && (
        <>
          <span className={`${styles.toolbarDivider} ${styles.desktopOnly}`} aria-hidden />
          {HIGHLIGHT_COLORS.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
              className={`${styles.colorDot} ${styles.desktopOnly}`}
              style={{ background: color }}
              aria-label={`${label} highlight`}
              title={`${label} highlight`}
            />
          ))}
        </>
      )}

      {/* Align - right alignment is dropped in lite; page copy is left or
          centered, never right. */}
      {TEXT_ALIGNS.filter(({ align }) => isFull || align !== 'right').map(({ align }) => (
        <button
          key={align}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign(align).run()}
          className={`${styles.toolBtn} ${styles.desktopOnly} ${editor.isActive({ textAlign: align }) ? styles.toolBtnActive : ''}`}
          aria-label={`Align ${align}`}
          aria-pressed={editor.isActive({ textAlign: align })}
          title={`Align ${align}`}
        >
          <span style={{ fontSize: '10px' }}>{align === 'left' ? '≡l' : align === 'center' ? '≡c' : '≡r'}</span>
        </button>
      ))}

      {/* Church callout shortcuts - full only */}
      {isFull && (
        <>
          <span className={`${styles.toolbarDivider} ${styles.desktopOnly}`} aria-hidden />
          {(Object.entries(CALLOUT_VARIANTS) as [string, typeof CALLOUT_VARIANTS[keyof typeof CALLOUT_VARIANTS]][]).map(([variant, config]) => (
            <button
              key={variant}
              type="button"
              onClick={() =>
                editor.chain().focus().insertContent({ type: 'calloutBlock', attrs: { variant } }).run()
              }
              className={`${styles.churchPill} ${styles.desktopOnly}`}
              style={{ borderColor: config.color, color: config.color, background: config.bg }}
              aria-label={`Insert ${config.label} block`}
              title={config.label}
            >
              {config.icon}&nbsp;{variant === 'announcement' ? 'Ann' : variant === 'prayer' ? 'Prayer' : variant === 'scripture' ? 'Verse' : 'Callout'}
            </button>
          ))}
        </>
      )}

      {/* Clear formatting - lite only. With no bubble toolbar to undo a stray
          bold, an explicit escape hatch matters more here. */}
      {!isFull && (
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          className={styles.toolBtn}
          aria-label="Clear formatting"
          title="Clear formatting"
        >
          &#10005;A
        </button>
      )}

      <span className={styles.toolbarSpacer} aria-hidden />

      {/* Insert image + emoji - full only */}
      {isFull && (
        <>
          <button
            type="button"
            onClick={onImageClick}
            className={styles.imageBtn}
            aria-label="Insert image"
            title="Insert image - or drag &amp; drop / paste into the text"
          >
            &#128444;&nbsp;Image
          </button>

          <button
            type="button"
            onClick={onEmojiClick}
            className={styles.toolBtn}
            aria-label="Insert emoji"
            title="Emoji"
          >
            &#128522;
          </button>
        </>
      )}
    </div>
  )
}

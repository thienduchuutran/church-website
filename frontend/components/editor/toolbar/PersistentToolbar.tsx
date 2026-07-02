'use client'

import type { Editor } from '@tiptap/react'
import { CALLOUT_VARIANTS } from '../constants'
import styles from '../RichBodyEditor.module.css'

interface PersistentToolbarProps {
  editor: Editor | null
  onEmojiClick: () => void
  onImageClick: () => void
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

export function PersistentToolbar({ editor, onEmojiClick, onImageClick }: PersistentToolbarProps) {
  if (!editor) return null

  const currentLevel: number =
    editor.isActive('heading', { level: 1 }) ? 1
    : editor.isActive('heading', { level: 2 }) ? 2
    : editor.isActive('heading', { level: 3 }) ? 3
    : 0

  function setHeading(level: number) {
    if (level === 0) editor!.chain().focus().setParagraph().run()
    else editor!.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
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
        <option value={1}>H1</option>
        <option value={2}>H2</option>
        <option value={3}>H3</option>
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

      {/* Ordered list - desktop only */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${styles.toolBtn} ${styles.desktopOnly} ${editor.isActive('orderedList') ? styles.toolBtnActive : ''}`}
        aria-label="Numbered list"
        aria-pressed={editor.isActive('orderedList')}
        title="Numbered List"
      >
        1.&equiv;
      </button>

      {/* Blockquote - desktop only */}
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

      {/* Code block - desktop only */}
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

      {/* Highlight colors - desktop only */}
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

      {/* Align - desktop only */}
      {TEXT_ALIGNS.map(({ align, icon }) => (
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

      {/* Church callout shortcuts - desktop only */}
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

      <span className={styles.toolbarSpacer} aria-hidden />

      {/* Insert image - labeled so it reads as an action, not a mystery glyph */}
      <button
        type="button"
        onClick={onImageClick}
        className={styles.imageBtn}
        aria-label="Insert image"
        title="Insert image - or drag &amp; drop / paste into the text"
      >
        &#128444;&nbsp;Image
      </button>

      {/* Emoji */}
      <button
        type="button"
        onClick={onEmojiClick}
        className={styles.toolBtn}
        aria-label="Insert emoji"
        title="Emoji"
      >
        &#128522;
      </button>
    </div>
  )
}

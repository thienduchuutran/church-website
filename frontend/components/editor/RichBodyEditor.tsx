'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'

import { useAuth } from '@/lib/auth'
import { uploadEditorImage } from '@/lib/uploads'
import { CalloutBlock } from './extensions/CalloutBlock'
import { Indent } from './extensions/Indent'
import { PersistentToolbar } from './toolbar/PersistentToolbar'
import { BubbleToolbar } from './toolbar/BubbleToolbar'
import { SlashMenu } from './menus/SlashMenu'
import { EmojiMenu } from './menus/EmojiMenu'
import { StatusBar } from './StatusBar'
import styles from './RichBodyEditor.module.css'

export interface RichBodyEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  // 'full' is the post composer: images, callouts, colours, slash menu.
  // 'lite' is the page-section editor: text, lists, indent, links only.
  //
  // The difference is not cosmetic - lite drops the Image/Callout/Color/
  // Highlight extensions entirely, so the toolbar cannot offer a command the
  // schema has no node for, and a page body can never contain markup the
  // public page has no styles for.
  variant?: 'full' | 'lite'
  // Screen-reader name for the editable region. Defaults to the post-composer
  // wording; a page block passes its own so several editors on one screen are
  // distinguishable.
  ariaLabel?: string
}

// imageFilesFrom keeps only image files from a drop/paste/select list.
function imageFilesFrom(list?: FileList | null): File[] {
  return list ? Array.from(list).filter((f) => f.type.startsWith('image/')) : []
}

// findImagePos returns the document position of the first image node with the
// given src, or -1. Used to locate a placeholder so its src can be swapped for
// the uploaded URL (or removed on failure).
function findImagePos(editor: Editor, src: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === 'image' && node.attrs.src === src) {
      found = pos
      return false
    }
    return true
  })
  return found
}

function replaceImageSrc(editor: Editor, oldSrc: string, newSrc: string) {
  const pos = findImagePos(editor, oldSrc)
  if (pos === -1) return
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc }))
}

function removeImage(editor: Editor, src: string) {
  const pos = findImagePos(editor, src)
  if (pos === -1) return
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
}

export function RichBodyEditor({
  value,
  onChange,
  placeholder,
  className,
  variant = 'full',
  ariaLabel = 'Post body',
}: RichBodyEditorProps) {
  const isLite = variant === 'lite'
  const resolvedPlaceholder =
    placeholder ?? (isLite ? 'Write this section…' : 'Start writing… or type / to insert a block')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isDropActive, setIsDropActive] = useState(false)
  const isExternalUpdate = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  // handleDrop/handlePaste are captured once at editor init, so they reach the
  // latest uploader through a ref to avoid a stale session closure.
  const uploadRef = useRef<(file: File) => void>(() => {})

  const { session } = useAuth()

  // uploadAndInsert drops an instant blob-URL placeholder at the cursor so the
  // image shows immediately at the right spot, uploads it, then swaps the src
  // for the permanent R2 URL (or removes the placeholder if the upload fails).
  const uploadAndInsert = useCallback(
    (file: File) => {
      const editor = editorRef.current
      if (!editor || !session || !file.type.startsWith('image/')) return

      const blobUrl = URL.createObjectURL(file)
      editor.chain().focus().setImage({ src: blobUrl }).run()
      setUploadingCount((n) => n + 1)

      uploadEditorImage(file, session.access_token)
        .then(({ url }) => replaceImageSrc(editor, blobUrl, url))
        .catch(() => removeImage(editor, blobUrl))
        .finally(() => {
          URL.revokeObjectURL(blobUrl)
          setUploadingCount((n) => Math.max(0, n - 1))
        })
    },
    [session],
  )

  useEffect(() => {
    uploadRef.current = uploadAndInsert
  }, [uploadAndInsert])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Lite headings start at H3: the block title already renders as <h2>
        // on the public page, so H1/H2 in a body would break the outline.
        heading: { levels: isLite ? [3, 4] : [1, 2, 3] },
        bulletList: {},
        orderedList: {},
        blockquote: {},
        codeBlock: {},
        horizontalRule: {},
        strike: {},
        link: { openOnClick: false, autolink: true },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      CharacterCount.configure({}),
      Placeholder.configure({ placeholder: resolvedPlaceholder }),
      Indent,
      // Composer-only extensions. Excluded from lite so the page-block schema
      // physically cannot hold an image, callout, colour or highlight.
      ...(isLite
        ? []
        : [
            Highlight.configure({ multicolor: true }),
            Color,
            CalloutBlock,
            Image.configure({ inline: false, allowBase64: false }),
          ]),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      if (!isExternalUpdate.current) {
        onChange(ed.getHTML())
      }
    },
    editorProps: {
      attributes: {
        class: styles.editorContent,
        spellcheck: 'true',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
      },
      // Dropped image files insert at the drop point; other drops fall through
      // to ProseMirror's default handling. In lite there is no image node in
      // the schema, so dropped files are ignored rather than half-handled.
      handleDrop: (view, event, _slice, moved) => {
        if (moved || isLite) return false
        const images = imageFilesFrom((event as DragEvent).dataTransfer?.files)
        if (images.length === 0) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
        if (at) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at.pos)))
        }
        images.forEach((f) => uploadRef.current(f))
        return true
      },
      // Pasted image files insert at the cursor; text/HTML pastes fall through.
      handlePaste: (_view, event) => {
        if (isLite) return false
        const images = imageFilesFrom((event as ClipboardEvent).clipboardData?.files)
        if (images.length === 0) return false
        event.preventDefault()
        images.forEach((f) => uploadRef.current(f))
        return true
      },
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Sync external value changes (e.g. loading a post for editing) without
  // clobbering cursor position on every keystroke.
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value) {
      isExternalUpdate.current = true
      editor.commands.setContent(value, { emitUpdate: false })
      isExternalUpdate.current = false
    }
    // Only run when value changes from outside, not on every editor update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    imageFilesFrom(e.target.files).forEach((f) => uploadAndInsert(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Highlight the whole editor as a drop target while an image file is dragged
  // over it. The actual insert is handled by ProseMirror's editorProps.handleDrop.
  function handleWrapperDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
    e.preventDefault()
    if (!isDropActive) setIsDropActive(true)
  }
  function handleWrapperDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Ignore leaves into child elements; only clear when leaving the wrapper.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDropActive(false)
  }

  return (
    <div
      className={`${styles.editorWrapper} ${isDropActive ? styles.dropActive : ''} ${className ?? ''}`}
      onDragOver={isLite ? undefined : handleWrapperDragOver}
      onDragLeave={isLite ? undefined : handleWrapperDragLeave}
      onDrop={isLite ? undefined : () => setIsDropActive(false)}
    >
      <PersistentToolbar
        editor={editor}
        variant={variant}
        onEmojiClick={() => setEmojiOpen(true)}
        onImageClick={() => fileInputRef.current?.click()}
      />
      {!isLite && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      )}
      {uploadingCount > 0 && (
        <p className="px-3 py-1.5 font-sans text-xs text-muted" role="status">
          Uploading {uploadingCount} image{uploadingCount === 1 ? '' : 's'}… please wait to save.
        </p>
      )}
      <EditorContent editor={editor} />
      {!isLite && (
        <p className={styles.imageHint}>Drag &amp; drop or paste images anywhere in your text.</p>
      )}
      {editor && !isLite && (
        <>
          {/* All three read commands the lite schema does not have (highlight,
              colour, image, callout), so they are composer-only. */}
          <BubbleToolbar editor={editor} />
          <SlashMenu editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
          <EmojiMenu
            editor={editor}
            open={emojiOpen}
            onClose={() => setEmojiOpen(false)}
          />
        </>
      )}
      {!isLite && <StatusBar editor={editor} />}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'

import { sanitizeBody } from '@/lib/sanitizeBody'
import { CalloutBlock } from './extensions/CalloutBlock'
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
}

export function RichBodyEditor({
  value,
  onChange,
  placeholder = 'Start writing… or type / to insert a block',
  className,
}: RichBodyEditorProps) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const isExternalUpdate = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: {},
        orderedList: {},
        blockquote: {},
        codeBlock: {},
        horizontalRule: {},
        strike: {},
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      CharacterCount.configure({}),
      Placeholder.configure({ placeholder }),
      CalloutBlock,
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
        'aria-label': 'Post body',
      },
      // Strip pasted junk (inline color spans, empty wrappers, disallowed tags)
      // before Tiptap parses it. This is the root-cause fix for the
      // `color: oklab(...)` markup that came in from churchcenter.com/Gmail and
      // then got carried verbatim into the Vietnamese translations.
      transformPastedHTML: (html) => sanitizeBody(html),
    },
    immediatelyRender: false,
  })

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

  return (
    <div className={`${styles.editorWrapper} ${className ?? ''}`}>
      <PersistentToolbar editor={editor} onEmojiClick={() => setEmojiOpen(true)} />
      <EditorContent editor={editor} />
      {editor && (
        <>
          <BubbleToolbar editor={editor} />
          <SlashMenu editor={editor} />
          <EmojiMenu
            editor={editor}
            open={emojiOpen}
            onClose={() => setEmojiOpen(false)}
          />
        </>
      )}
      <StatusBar editor={editor} />
    </div>
  )
}

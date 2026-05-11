'use client'

import { useCallback, useEffect, useState } from 'react'
import { type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { isTouchDevice } from '../constants'
import styles from '../RichBodyEditor.module.css'

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow highlight' },
  { color: '#bbf7d0', label: 'Green highlight' },
  { color: '#fecaca', label: 'Pink highlight' },
]

interface ToolBtnProps {
  onClick: () => void
  active?: boolean
  label: string
  children: React.ReactNode
  dark?: boolean
}

function ToolBtn({ onClick, active, label, children, dark }: ToolBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${dark ? styles.bubbleBtn : styles.bubbleBtn} ${active ? styles.bubbleBtnActive : ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

export function BubbleToolbar({ editor }: { editor: Editor | null }) {
  const [isTouch] = useState(() => isTouchDevice())
  const [showMobileBar, setShowMobileBar] = useState(false)

  const checkSelection = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    setShowMobileBar(from !== to && editor.isFocused)
  }, [editor])

  useEffect(() => {
    if (!editor || !isTouch) return

    editor.on('selectionUpdate', checkSelection)
    editor.on('focus', checkSelection)
    editor.on('blur', () => setShowMobileBar(false))

    return () => {
      editor.off('selectionUpdate', checkSelection)
      editor.off('focus', checkSelection)
      editor.off('blur', () => setShowMobileBar(false))
    }
  }, [editor, isTouch, checkSelection])

  if (!editor) return null

  const formatButtons = (
    <>
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="Bold">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="Italic">
        <em>I</em>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} label="Underline">
        <u>U</u>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} label="Strikethrough">
        <s>S</s>
      </ToolBtn>
      <span className={styles.bubbleDivider} aria-hidden />
      {HIGHLIGHT_COLORS.map(({ color, label }) => (
        <button
          key={color}
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
          className={styles.highlightDot}
          style={{ background: color }}
          aria-label={label}
          title={label}
        />
      ))}
    </>
  )

  if (isTouch) {
    if (!showMobileBar) return null
    return (
      <div
        className={styles.mobileFormatBar}
        role="toolbar"
        aria-label="Text formatting"
      >
        {formatButtons}
        <span className={styles.bubbleDivider} aria-hidden />
        <button
          type="button"
          className={styles.bubbleBtn}
          onClick={() => setShowMobileBar(false)}
          aria-label="Close formatting toolbar"
        >
          &times;
        </button>
      </div>
    )
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: 'top' }}
      shouldShow={({ state, from, to }) => from !== to}
    >
      <div className={styles.bubblePill} role="toolbar" aria-label="Text formatting">
        {formatButtons}
      </div>
    </BubbleMenu>
  )
}

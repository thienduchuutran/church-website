'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { isTouchDevice } from '../constants'
import styles from '../RichBodyEditor.module.css'

interface EmojiMenuProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
}

interface EmojiMartSelection {
  native: string
}

export function EmojiMenu({ editor, open, onClose }: EmojiMenuProps) {
  const [isTouch] = useState(() => isTouchDevice())
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  if (!open) return null

  function handleSelect(emoji: EmojiMartSelection) {
    editor?.chain().focus().insertContent(emoji.native).run()
    onClose()
  }

  if (isTouch) {
    return (
      <>
        <div className={styles.mobileSheetOverlay} onClick={onClose} aria-hidden />
        <div ref={overlayRef} className={styles.mobileSheet} role="dialog" aria-label="Emoji picker">
          <div className={styles.sheetHandle} />
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            theme="light"
            set="native"
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      </>
    )
  }

  return (
    <div ref={overlayRef} className={styles.emojiPopover} role="dialog" aria-label="Emoji picker">
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme="light"
        set="native"
        previewPosition="none"
        skinTonePosition="none"
        perLine={8}
      />
    </div>
  )
}

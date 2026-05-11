'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import styles from './RichBodyEditor.module.css'

type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function StatusBar({ editor }: { editor: Editor | null }) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setSaveStatus('unsaved')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setSaveStatus('saving')
        timerRef.current = setTimeout(() => setSaveStatus('saved'), 1000)
      }, 2000)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [editor])

  const counts = useEditorState({
    editor,
    selector: (ctx) => ({
      chars: ctx.editor?.storage.characterCount?.characters?.() ?? 0,
      words: ctx.editor?.storage.characterCount?.words?.() ?? 0,
    }),
  })

  if (!editor) return null

  const chars = counts?.chars ?? 0
  const words = counts?.words ?? 0
  const readMin = Math.max(1, Math.ceil(words / 200))

  return (
    <div className={styles.statusBar}>
      <span className={styles.statsText}>
        {words} words&nbsp;&middot;&nbsp;~{readMin} min read
      </span>
      <div className={styles.statusRight}>
        <span className={styles.saveStatus}>
          {saveStatus === 'saved' && (
            <>
              <span className={styles.dotGreen} />
              Saved
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <span className={styles.spinnerRing} />
              Saving&hellip;
            </>
          )}
          {saveStatus === 'unsaved' && (
            <>
              <span className={styles.dotAmber} />
              Unsaved
            </>
          )}
        </span>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>
          {chars} chars
        </span>
      </div>
    </div>
  )
}

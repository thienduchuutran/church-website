'use client'

import { useEffect, useRef, useState } from 'react'
import { type Editor } from '@tiptap/react'
import { FloatingMenu } from '@tiptap/react/menus'
import { SLASH_ITEMS } from '../constants'
import styles from '../RichBodyEditor.module.css'

function getSlashQuery(editor: Editor): string | null {
  const { $from } = editor.state.selection
  if ($from.parent.type.name !== 'paragraph') return null
  const text = $from.parent.textContent
  return text.startsWith('/') ? text.slice(1) : null
}

export function SlashMenu({
  editor,
  onInsertImage,
}: {
  editor: Editor | null
  onInsertImage?: () => void
}) {
  const [query, setQuery] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Refs to avoid stale closures in the stable keydown handler
  const isVisibleRef = useRef(false)
  const selectedIdxRef = useRef(0)
  const filteredRef = useRef(SLASH_ITEMS)

  const filtered = SLASH_ITEMS.filter((item) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      item.label.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    )
  })
  filteredRef.current = filtered

  const groups = [...new Set(filtered.map((i) => i.group))]

  function runItem(item: (typeof SLASH_ITEMS)[number]) {
    if (!editor) return
    const { $from } = editor.state.selection
    const text = $from.parent.textContent
    if (text.startsWith('/')) {
      editor.commands.deleteRange({ from: $from.start(), to: $from.pos })
    }
    // Image opens the editor's file picker (upload needs the auth token that
    // lives in RichBodyEditor); everything else runs its editor command.
    if (item.image) {
      onInsertImage?.()
    } else {
      item.action(editor)
    }
  }

  // Keep refs in sync for the stable keydown handler
  const runItemRef = useRef(runItem)
  runItemRef.current = runItem
  useEffect(() => { selectedIdxRef.current = selectedIdx }, [selectedIdx])

  // Sync query from editor text after "/"
  useEffect(() => {
    if (!editor) return
    const sync = () => setQuery(getSlashQuery(editor))
    editor.on('update', sync)
    editor.on('selectionUpdate', sync)
    return () => {
      editor.off('update', sync)
      editor.off('selectionUpdate', sync)
    }
  }, [editor])

  // Reset selection when query changes
  useEffect(() => { setSelectedIdx(0) }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // Keyboard navigation - attached once, reads current values via refs
  useEffect(() => {
    if (!editor) return
    const handleKey = (e: KeyboardEvent) => {
      if (!isVisibleRef.current) return
      const items = filteredRef.current
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const next = Math.min(selectedIdxRef.current + 1, items.length - 1)
        selectedIdxRef.current = next
        setSelectedIdx(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const prev = Math.max(selectedIdxRef.current - 1, 0)
        selectedIdxRef.current = prev
        setSelectedIdx(prev)
      } else if (e.key === 'Enter' && items[selectedIdxRef.current]) {
        e.preventDefault()
        e.stopPropagation()
        runItemRef.current(items[selectedIdxRef.current])
      } else if (e.key === 'Escape') {
        const { $from } = editor.state.selection
        const text = $from.parent.textContent
        if (text.startsWith('/')) {
          editor.commands.deleteRange({ from: $from.start(), to: $from.pos })
        }
      }
    }
    editor.view.dom.addEventListener('keydown', handleKey, { capture: true })
    return () => editor.view.dom.removeEventListener('keydown', handleKey, { capture: true })
  }, [editor])

  if (!editor) return null

  return (
    <FloatingMenu
      editor={editor}
      options={{ placement: 'bottom-start' }}
      shouldShow={({ state }) => {
        const { $from } = state.selection
        if ($from.parent.type.name !== 'paragraph') return false
        const visible = $from.parent.textContent.startsWith('/')
        isVisibleRef.current = visible
        return visible
      }}
    >
      <div className={styles.slashMenu}>
        <div ref={listRef} className={styles.slashList} role="listbox" aria-label="Insert block">
          {groups.length === 0 && (
            <div className={styles.slashEmpty}>No blocks match &ldquo;{query}&rdquo;</div>
          )}
          {groups.map((group) => (
            <div key={group}>
              <div className={styles.slashGroup}>{group}</div>
              {filtered
                .filter((i) => i.group === group)
                .map((item) => {
                  const flatIdx = filtered.indexOf(item)
                  return (
                    <button
                      key={item.label}
                      data-idx={flatIdx}
                      onClick={() => runItem(item)}
                      className={`${styles.slashItem} ${flatIdx === selectedIdx ? styles.slashItemActive : ''}`}
                      role="option"
                      aria-selected={flatIdx === selectedIdx}
                      type="button"
                    >
                      <span className={styles.slashIcon}>{item.icon}</span>
                      <span className={styles.slashText}>
                        <span className={styles.slashLabel}>{item.label}</span>
                        <span className={styles.slashDesc}>{item.desc}</span>
                      </span>
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </FloatingMenu>
  )
}

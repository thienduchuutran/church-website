'use client'

import { sanitizeBody, htmlToText } from '@/lib/sanitizeBody'

interface RichContentProps {
  html: string
  className?: string
  showMeta?: boolean
}

function countWords(html: string): number {
  const text = htmlToText(html)
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function RichContent({ html, className, showMeta = false }: RichContentProps) {
  // Shared sanitizer: drops every inline style except text-align, so any
  // legacy `color: oklab(...)` markup still sitting in stored posts renders
  // clean here without waiting on a data backfill.
  const clean = sanitizeBody(html)

  const wordCount = showMeta ? countWords(html) : 0
  const readMin = showMeta ? Math.max(1, Math.ceil(wordCount / 200)) : 0

  return (
    <>
      {showMeta && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          {wordCount} words&nbsp;&middot;&nbsp;~{readMin} min read
        </p>
      )}
      <div
        className={`rich-content ${className ?? ''}`}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </>
  )
}

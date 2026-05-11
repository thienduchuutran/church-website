'use client'

import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'br', 'strong', 'em', 'u', 's', 'mark', 'a',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'div', 'span',
]
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-callout', 'data-callout-variant', 'style']

interface RichContentProps {
  html: string
  className?: string
  showMeta?: boolean
}

function countWords(html: string): number {
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['#text'] })
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function RichContent({ html, className, showMeta = false }: RichContentProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORCE_BODY: false,
  })

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

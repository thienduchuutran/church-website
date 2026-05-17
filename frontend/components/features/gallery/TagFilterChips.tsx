'use client'

import { useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { Tag } from '@/lib/types'

export interface TagFilterChipsProps {
  selectedTagId: string | null
  onTagSelect: (tagId: string | null) => void
}

export default function TagFilterChips({
  selectedTagId,
  onTagSelect,
}: TagFilterChipsProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchTags() {
      try {
        const fetchedTags = (await apiGet('/api/v1/tags')) as Tag[]
        setTags(fetchedTags)
      } catch (err) {
        console.error('Failed to load tags:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTags()
  }, [])

  if (loading) {
    return (
      <div className="h-10 bg-border/20 rounded-lg animate-pulse" />
    )
  }

  if (tags.length === 0) {
    return null
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-x-visible"
    >
      {/* All chips */}
      <button
        type="button"
        onClick={() => onTagSelect(null)}
        className={`shrink-0 rounded-full px-4 py-2 font-display text-sm font-medium transition-colors whitespace-nowrap ${
          selectedTagId === null
            ? 'bg-primary text-white'
            : 'bg-surface border border-border text-foreground hover:border-primary/30 hover:bg-primary/5'
        }`}
      >
        All
      </button>

      {/* Tag chips */}
      {tags.map(tag => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onTagSelect(selectedTagId === tag.id ? null : tag.id)}
          className={`shrink-0 rounded-full px-4 py-2 font-display text-sm font-medium transition-colors whitespace-nowrap ${
            selectedTagId === tag.id
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-foreground hover:border-primary/30 hover:bg-primary/5'
          }`}
        >
          {tag.name}
        </button>
      ))}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { apiGet, apiPost } from '@/lib/api'
import type { Tag } from '@/lib/types'

export interface TagSelectorProps {
  postId: string
  selectedTagIds: string[]
  onTagsChange: (tagIds: string[]) => void
}

export default function TagSelector({
  postId,
  selectedTagIds,
  onTagsChange,
}: TagSelectorProps) {
  const { session } = useAuth()
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loadingTags, setLoadingTags] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load available tags on mount
  useEffect(() => {
    async function fetchTags() {
      try {
        const tags = (await apiGet('/api/v1/tags')) as Tag[]
        setAllTags(tags)
      } catch (err) {
        console.error('Failed to load tags:', err)
      } finally {
        setLoadingTags(false)
      }
    }

    fetchTags()
  }, [])

  // Close dropdown on escape or outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
        setSearchInput('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // Get selected tag objects for display
  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id))

  // Filter tags: exclude already selected, match search
  const searchLower = searchInput.toLowerCase().trim()
  const filteredTags = allTags.filter(
    (tag) =>
      !selectedTagIds.includes(tag.id) &&
      (searchLower === '' || tag.name.toLowerCase().includes(searchLower))
  )

  // Check if search input is a valid new tag name (not already existing)
  const canCreateNewTag =
    searchLower.length > 0 && !allTags.some((t) => t.name.toLowerCase() === searchLower)

  async function handleCreateTag() {
    if (!session || !canCreateNewTag) return

    setIsCreating(true)
    setCreationError(null)

    try {
      const newTag = (await apiPost('/api/v1/tags', { name: searchLower }, session.access_token)) as Tag
      setAllTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
      onTagsChange([...selectedTagIds, newTag.id])
      setSearchInput('')
      setIsDropdownOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setCreationError(message)
    } finally {
      setIsCreating(false)
    }
  }

  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onTagsChange([...selectedTagIds, tagId])
    }
  }

  function handleRemoveTag(tagId: string) {
    onTagsChange(selectedTagIds.filter((id) => id !== tagId))
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && canCreateNewTag) {
      e.preventDefault()
      handleCreateTag()
    } else if (e.key === 'ArrowDown' && isDropdownOpen && filteredTags.length > 0) {
      e.preventDefault()
      const firstTag = dropdownRef.current?.querySelector('[data-tag-item]') as HTMLElement
      firstTag?.focus()
    }
  }

  const showNoResults = searchLower.length > 0 && filteredTags.length === 0 && !canCreateNewTag

  return (
    <div className="space-y-3">
      <label className="block font-display text-sm font-medium text-foreground">Tags</label>

      {/* Selected tags display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <div
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-sans text-sm font-medium text-white transition-all hover:bg-primary-light"
            >
              <span>{tag.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag.id)}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20 focus:outline-none focus:ring-1 focus:ring-white"
                aria-label={`Remove ${tag.name} tag`}
              >
                <span className="text-xs">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search and dropdown container */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search or create tags..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setIsDropdownOpen(true)
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={handleInputKeyDown}
            disabled={loadingTags}
            className="block flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
            aria-label="Search tags"
            aria-expanded={isDropdownOpen}
            aria-controls="tag-dropdown"
            aria-autocomplete="list"
          />

          {/* Create button (visible when valid new tag name) */}
          {canCreateNewTag && (
            <button
              type="button"
              onClick={handleCreateTag}
              disabled={isCreating}
              className="rounded-lg bg-accent px-3 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
              aria-label={`Create tag: ${searchLower}`}
            >
              {isCreating ? '...' : '+'}
            </button>
          )}
        </div>

        {/* Error message */}
        {creationError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-700">
            {creationError}
          </div>
        )}

        {/* Dropdown menu */}
        {isDropdownOpen && (
          <div
            id="tag-dropdown"
            className="absolute top-full left-0 right-0 z-10 mt-2 max-h-52 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
            role="listbox"
          >
            {loadingTags ? (
              <div className="px-4 py-3 text-center font-sans text-sm text-muted">
                Loading tags...
              </div>
            ) : filteredTags.length === 0 && !canCreateNewTag ? (
              <div className="px-4 py-3 text-center font-sans text-sm text-muted">
                {searchLower.length === 0
                  ? 'No tags available'
                  : 'No matching tags'}
              </div>
            ) : (
              <>
                {/* Available tags */}
                {filteredTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      toggleTag(tag.id)
                      setIsDropdownOpen(false)
                      setSearchInput('')
                    }}
                    data-tag-item
                    className="w-full border-b border-border/50 px-4 py-2.5 text-left font-sans text-sm text-foreground transition-colors hover:bg-background focus:bg-background focus:outline-none"
                    role="option"
                  >
                    {tag.name}
                  </button>
                ))}

                {/* Create new tag option */}
                {canCreateNewTag && (
                  <>
                    <div className="border-b border-border/50 px-4 py-2 font-sans text-xs text-muted">
                      Create new
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateTag}
                      disabled={isCreating}
                      className="w-full px-4 py-2.5 text-left font-sans text-sm font-medium text-primary transition-colors hover:bg-background focus:bg-background focus:outline-none disabled:opacity-50"
                      role="option"
                    >
                      {isCreating ? 'Creating...' : `+ ${searchLower}`}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Helper text */}
      {!loadingTags && (
        <p className="font-sans text-xs text-muted">
          {selectedTagIds.length === 0
            ? 'Add tags to organize this album'
            : `${selectedTagIds.length} tag${selectedTagIds.length === 1 ? '' : 's'} selected`}
        </p>
      )}
    </div>
  )
}

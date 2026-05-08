'use client'

import { useAuth } from '@/lib/auth'
import { useEditModal } from '@/lib/edit-modal'
import { POST_TYPE_LABELS } from '@/lib/post-types'

// Renders a "create" button on section pages, visible only to admins.
export default function AdminFeedActions({ section }: { section: string }) {
  const { isAdmin } = useAuth()
  const { openCreate } = useEditModal()
  if (!isAdmin) return null

  const label = POST_TYPE_LABELS[section] ?? section.replace('_', ' ')

  return (
    <button
      type="button"
      onClick={() => openCreate(section)}
      aria-label={`New ${label}`}
      className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary p-2 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light sm:px-4 sm:py-2"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      <span className="hidden sm:inline">New {label}</span>
    </button>
  )
}

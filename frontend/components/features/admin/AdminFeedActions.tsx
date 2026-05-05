'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

// Renders a "create" button on section pages, visible only to admins.
export default function AdminFeedActions({ section }: { section: string }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return null

  const label = section.replace('_', ' ')

  return (
    <Link
      href={`/admin/${section}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      New {label}
    </Link>
  )
}

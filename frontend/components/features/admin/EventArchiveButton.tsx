'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import { useEditModal } from '@/lib/edit-modal'
import { setPostArchived } from '@/lib/posts'
import { canUnarchive, isUpcoming } from '@/lib/events'
import type { Post } from '@/lib/types'

// Admin-only control to move an event between the Upcoming and Past sections.
// Renders nothing for non-admins (auth is client-side, so this also keeps the
// button out of the server-rendered HTML) and nothing for an event that is past
// purely by date - clearing the flag wouldn't move it back, so there's no action
// worth offering. The reverse direction ("Move to Upcoming") only shows when
// canUnarchive says it would actually return the event to Upcoming.
export default function EventArchiveButton({ post }: { post: Post }) {
  const { isAdmin, session } = useAuth()
  const { notifyChanged } = useEditModal()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  if (!isAdmin) return null

  const toPast = isUpcoming(post)
  const toUpcoming = !toPast && canUnarchive(post)
  if (!toPast && !toUpcoming) return null

  const label = toPast ? 'Move to Past' : 'Move to Upcoming'

  async function handleClick() {
    if (!session) return
    setPending(true)
    try {
      // toPast === true archives (moves to Past); false un-archives.
      await setPostArchived(post.id, toPast, session.access_token)
      router.refresh()
      notifyChanged()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move event')
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={label}
      className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-medium text-muted transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
    >
      {pending ? 'Moving…' : label}
    </button>
  )
}

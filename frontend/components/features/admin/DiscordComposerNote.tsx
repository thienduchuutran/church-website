'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import { getDiscordStatus, type DiscordStatus } from '@/lib/discord'
import { POST_TYPE_DISCORD_CHANNELS } from '@/lib/post-types'

// DiscordComposerNote shows, at publish time, which Discord channel the post
// goes to and under whose identity - plus the "Notify @everyone" opt-in. Shown
// only when creating (not editing): an edit re-syncs content but never re-sends
// identity or re-pings. Self-contained: it fetches the admin's link status so
// PostFormFields can stay presentational.
export default function DiscordComposerNote({
  section,
  notifyEveryone,
  onNotifyChange,
}: {
  section: string
  notifyEveryone: boolean
  onNotifyChange: (next: boolean) => void
}) {
  const { session } = useAuth()
  const [status, setStatus] = useState<DiscordStatus | null>(null)

  useEffect(() => {
    if (!session) return
    getDiscordStatus(session.access_token)
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [session])

  const channel = POST_TYPE_DISCORD_CHANNELS[section]
  // Unknown section -> no Discord delivery, so nothing to preview.
  if (!channel) return null

  const linkedName = status?.linked ? status.discord_username : null

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface/50 p-4">
      <p className="font-sans text-sm text-foreground">
        This will post to <span className="font-medium">#{channel}</span>
        {linkedName ? (
          <>
            {' '}as <span className="font-medium">{linkedName}</span>.
          </>
        ) : (
          <> as the church default.</>
        )}
      </p>

      {status && !status.linked && (
        <p className="font-sans text-xs text-muted">
          <Link href="/admin" className="text-primary underline">
            Link your Discord
          </Link>{' '}
          to post as yourself.
        </p>
      )}

      <label className="flex items-center gap-2 font-sans text-sm text-foreground">
        <input
          type="checkbox"
          checked={notifyEveryone}
          onChange={(e) => onNotifyChange(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        Notify <span className="font-medium">@everyone</span>
      </label>
    </div>
  )
}

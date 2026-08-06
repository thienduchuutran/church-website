'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { getDiscordLinkUrl, getDiscordStatus, type DiscordStatus } from '@/lib/discord'
import { ApiError } from '@/lib/api'

// DiscordLinkCard lets an admin connect their Discord account once, so their
// posts appear in Discord under their own name + avatar. Lives on the admin
// dashboard. When unconfigured on the server (503), it explains that linking is
// unavailable rather than showing a dead button.
export default function DiscordLinkCard() {
  const { session } = useAuth()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<DiscordStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ?discord=linked|error is set by the OAuth callback redirect.
  const callbackResult = searchParams.get('discord')

  useEffect(() => {
    if (!session) return
    getDiscordStatus(session.access_token)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [session])

  async function handleLink() {
    if (!session) return
    setRedirecting(true)
    setError(null)
    try {
      const url = await getDiscordLinkUrl(session.access_token)
      window.location.href = url
    } catch (err) {
      setRedirecting(false)
      if (err instanceof ApiError && err.status === 503) {
        setError('Discord linking is not configured on the server yet.')
      } else {
        setError('Could not start the Discord link. Please try again.')
      }
    }
  }

  const isLinked = status?.linked === true

  return (
    <div className="card-rest rounded-xl border border-border bg-surface p-6 space-y-5">
      <div>
        <h2 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted">
          Discord
        </h2>
        <p className="mt-1 font-sans text-xs text-muted">
          Link your Discord so your posts appear in the church server under your own name and avatar.
        </p>
      </div>

      {callbackResult === 'linked' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700">
          Discord linked successfully.
        </div>
      )}
      {callbackResult === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Something went wrong linking Discord. Please try again.
        </div>
      )}

      {loading ? (
        <p className="font-sans text-sm text-muted">Loading...</p>
      ) : isLinked ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
          <div className="flex items-center gap-3">
            {status?.discord_avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.discord_avatar_url}
                alt=""
                className="h-9 w-9 rounded-full bg-border object-cover"
              />
            )}
            <div>
              <p className="font-sans text-sm font-medium text-foreground">
                {status?.discord_username}
              </p>
              <p className="font-sans text-xs text-muted">Posts publish as you.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLink}
            disabled={redirecting}
            className="rounded-lg border border-border px-3 py-1.5 font-display text-xs font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
          >
            {redirecting ? 'Opening...' : 'Re-link'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLink}
          disabled={redirecting}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
        >
          {redirecting ? 'Opening Discord...' : 'Link my Discord'}
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}

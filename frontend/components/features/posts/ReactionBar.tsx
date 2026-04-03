'use client'

import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPostAnon, apiDeleteAnon } from '@/lib/api'

const EMOJIS = ['👍', '❤️', '🙏', '😂'] as const
type Emoji = (typeof EMOJIS)[number]

const EMOJI_LABEL: Record<Emoji, string> = {
  '👍': 'Like',
  '❤️': 'Love',
  '🙏': 'Pray',
  '😂': 'Haha',
}

// Returns a stable per-browser UUID stored in localStorage.
// Called only from event handlers and effects so localStorage is always available.
function getFingerprint(): string {
  const key = 'church_reaction_fp'
  let fp = localStorage.getItem(key)
  if (!fp) {
    fp = crypto.randomUUID()
    localStorage.setItem(key, fp)
  }
  return fp
}

export default function ReactionBar({
  postId,
  showReactions = true,
}: {
  postId: string
  showReactions?: boolean
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [myReaction, setMyReaction] = useState<string | null>(null)
  // pickerOpen controls the hover popup visibility.
  const [pickerOpen, setPickerOpen] = useState(false)
  // pending prevents double-submits while a request is in flight.
  const [pending, setPending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showReactions) return

    const fp = getFingerprint()

    // Single backend call: returns both per-emoji counts and this browser's reaction.
    // Routing through the backend keeps DB access out of the UI layer.
    apiGet(`/api/v1/reactions/${postId}?fingerprint=${encodeURIComponent(fp)}`)
      .then((data: { counts: { emoji: string; count: number }[]; my_reaction: string | null }) => {
        const grouped: Record<string, number> = {}
        for (const r of data.counts) {
          grouped[r.emoji] = r.count
        }
        setCounts(grouped)
        setMyReaction(data.my_reaction ?? null)
      })
  }, [postId, showReactions])

  async function handleReact(emoji: string) {
    if (pending) return
    const fp = getFingerprint()
    setPending(true)
    setPickerOpen(false)

    try {
      if (myReaction === emoji) {
        // Clicking the active reaction removes it.
        await apiDeleteAnon(`/api/v1/reactions/${postId}`, { fingerprint: fp })
        setCounts((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }))
        setMyReaction(null)
      } else {
        // Add or switch reaction — backend does an upsert.
        await apiPostAnon('/api/v1/reactions', { post_id: postId, emoji, fingerprint: fp })
        setCounts((prev) => {
          const next = { ...prev }
          // Decrement the old emoji if switching.
          if (myReaction) next[myReaction] = Math.max(0, (next[myReaction] ?? 1) - 1)
          next[emoji] = (next[emoji] ?? 0) + 1
          return next
        })
        setMyReaction(emoji)
      }
    } finally {
      setPending(false)
    }
  }

  if (!showReactions) return null

  // Only show the count row for emojis that have at least one reaction.
  const activeEmojis = EMOJIS.filter((e) => (counts[e] ?? 0) > 0)

  return (
    <div className="pt-3">
      {/* Like button + hover picker wrapper */}
      <div
        ref={containerRef}
        className="relative inline-block"
        onMouseEnter={() => setPickerOpen(true)}
        onMouseLeave={() => setPickerOpen(false)}
      >
        {/*
          Outer wrapper: transparent, positioned from bottom-full down to the button top.
          pb-2 fills the visual gap between the pill and the button, so the mouse never
          leaves the container while crossing that space — no mouseleave fires mid-transit.
        */}
        <div
          className={`absolute bottom-full left-0 pb-2 ${
            pickerOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {/* Inner pill: visible styling + slide-up animation */}
          <div
            role="toolbar"
            aria-label="Reaction picker"
            className={`flex gap-1 rounded-full border border-border bg-surface px-2 py-1.5 shadow-lg transition-all duration-200 ${
              pickerOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-2 opacity-0'
            }`}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                title={EMOJI_LABEL[emoji]}
                onClick={() => handleReact(emoji)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform duration-150 hover:scale-125 active:scale-95 ${myReaction === emoji ? 'bg-primary/15' : 'hover:bg-muted/20'
                  }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Primary trigger: shows the current reaction (or default 👍 Like) */}
        <button
          type="button"
          onClick={() => handleReact(myReaction ?? '👍')}
          disabled={pending}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${myReaction
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
            }`}
        >
          <span className="text-base leading-none">{myReaction ?? '👍'}</span>
          {/* <span>{myLabel}</span> */}
        </button>
      </div>

      {/* Reaction count bubbles — only rendered when there are reactions */}
      {activeEmojis.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              disabled={pending}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${myReaction === emoji
                ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                : 'border-border text-muted hover:border-primary/20 hover:bg-primary/5'
                }`}
            >
              <span>{emoji}</span>
              <span>{counts[emoji]}</span>
            </button>
          ))}
        </div>
      )}

      {activeEmojis.length === 0 && (
        <p className="mt-1 text-xs text-muted">Be the first to react</p>
      )}
    </div>
  )
}

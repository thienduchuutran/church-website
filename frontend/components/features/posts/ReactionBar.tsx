'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const EMOJIS = ['👍', '❤️', '🙏', '😂']

export default function ReactionBar({
  postId,
  showReactions = true,
}: {
  postId: string
  showReactions?: boolean
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!showReactions) return

    supabase
      .from('reactions')
      .select('emoji')
      .eq('post_id', postId)
      .then(({ data }) => {
        if (!data) return
        const grouped: Record<string, number> = {}
        for (const r of data) {
          grouped[r.emoji] = (grouped[r.emoji] || 0) + 1
        }
        setCounts(grouped)
      })
  }, [postId, showReactions])

  if (!showReactions) return null

  const hasAny = Object.values(counts).some((c) => c > 0)

  return (
    <div className="flex items-center gap-2 pt-3">
      {EMOJIS.map((emoji) => {
        const count = counts[emoji] ?? 0
        return (
          <button
            key={emoji}
            type="button"
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
              count > 0
                ? 'border-primary/30 bg-primary/5 text-foreground'
                : 'border-border text-muted hover:border-primary/20 hover:bg-primary/5'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="text-xs font-medium">{count}</span>}
          </button>
        )
      })}
      {!hasAny && <span className="text-xs text-muted">Be the first to react</span>}
    </div>
  )
}

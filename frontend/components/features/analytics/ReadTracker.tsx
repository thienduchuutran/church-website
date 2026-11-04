'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'

// Posts are read in the feed, not on a detail page, so a page view says
// nothing about which post was read. ReadTracker is an invisible sentinel
// placed between a card's title and body: when it has been on screen for
// two continuous seconds the post counts as read, once per post per tab.
//
// Why a sentinel and not the card's own element: PostCard is a server
// component, so the observer has to live in a client child, and a zero-height
// span costs nothing in layout.
const DWELL_MS = 2_000
const seen = new Set<string>()

export default function ReadTracker({ postId }: { postId: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || seen.has(postId) || typeof IntersectionObserver === 'undefined') return
    let timer: number | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (visible && timer === null) {
          timer = window.setTimeout(() => {
            if (!seen.has(postId)) {
              seen.add(postId)
              track('post_read', { post_id: postId })
            }
            observer.disconnect()
          }, DWELL_MS)
        } else if (!visible && timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [postId])

  return <span ref={ref} aria-hidden className="block h-px w-px" />
}

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

// Facebook-style long-press gesture tuning.
// LONG_PRESS_MS: how long the user must hold before the picker opens.
// MOVE_CANCEL_PX: if the finger moves further than this before the timer fires,
// treat it as a scroll/jitter gesture and cancel the long-press.
const LONG_PRESS_MS = 350
const MOVE_CANCEL_PX = 10

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
  // pickerOpen controls picker visibility for both hover (desktop) and long-press (touch) paths.
  const [pickerOpen, setPickerOpen] = useState(false)
  // hoveredEmoji tracks which emoji the finger is currently over during a drag-to-select,
  // so we can scale it up and lift it - matching Facebook's live preview.
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null)
  // pending prevents double-submits while a request is in flight.
  const [pending, setPending] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Refs (not state) for transient gesture data so handler identity doesn't change and we don't trigger re-renders mid-gesture.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerTypeRef = useRef<string>('mouse')

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

  // Dismiss the picker when the user taps outside.
  // On mobile there is no hover-out event, so this is the only way to close it.
  // Note: we deliberately do NOT close on scroll - the picker is absolutely
  // positioned inside the post card, so it scrolls together with the page.
  // Closing on scroll would also fire during the drag-to-select gesture (the
  // browser produces tiny scrolls as the finger moves upward to the bar) and
  // kill the picker before the user can pick anything.
  useEffect(() => {
    if (!pickerOpen) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false)
        setHoveredEmoji(null)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
    }
  }, [pickerOpen])

  // While the long-press drag is active, block the underlying touchmove from
  // scrolling the page. We do this here (non-passive listener + preventDefault)
  // because touch-action is evaluated at touchstart and cannot be changed
  // mid-gesture on iOS - so CSS alone cannot stop scroll once the drag starts.
  // Gated on longPressFiredRef so hover-opened pickers on desktop don't lock
  // the page.
  useEffect(() => {
    if (!pickerOpen) return
    const onTouchMove = (e: TouchEvent) => {
      if (longPressFiredRef.current) {
        e.preventDefault()
      }
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [pickerOpen])

  // Walk up from the element at the pointer's coordinates to find the nearest
  // emoji button. Returns null when the finger is between buttons or off the bar.
  function emojiAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (!el) return null
    const btn = el.closest<HTMLElement>('[data-emoji]')
    return btn?.dataset.emoji ?? null
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    pointerTypeRef.current = e.pointerType
    // Mouse already has hover - the long-press path is for touch/pen only.
    if (e.pointerType === 'mouse') return

    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    longPressFiredRef.current = false
    cancelLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      setPickerOpen(true)
      // Light haptic to acknowledge the gesture - matches Facebook/iOS conventions.
      try { navigator.vibrate?.(12) } catch { /* unsupported - silent fallback */ }
      // Capture the pointer so move/up events keep firing on this button even after
      // the finger drifts off it onto the picker bar above.
      try { triggerRef.current?.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse') return
    const start = pointerStartRef.current
    if (!start) return

    if (!longPressFiredRef.current) {
      // Picker hasn't opened yet - if the finger moves too far, the user is
      // scrolling, not long-pressing. Cancel the timer so we don't surprise them.
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        cancelLongPress()
      }
      return
    }
    // Picker is open and the finger is dragging - update the "hovered" emoji so
    // the UI lifts and scales it for live preview.
    setHoveredEmoji(emojiAtPoint(e.clientX, e.clientY))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    cancelLongPress()
    try { triggerRef.current?.releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    if (longPressFiredRef.current && pointerTypeRef.current !== 'mouse') {
      // Release-to-select: if the finger is over an emoji, that's the pick.
      const picked = emojiAtPoint(e.clientX, e.clientY)
      if (picked) {
        handleReact(picked)
        setHoveredEmoji(null)
      }
      // Leave longPressFiredRef = true so the synthetic click that fires next
      // is swallowed by handleTriggerClick instead of toggling the default Like.
      return
    }
  }

  function handlePointerCancel() {
    cancelLongPress()
    longPressFiredRef.current = false
    pointerStartRef.current = null
  }

  async function handleReact(emoji: string) {
    if (pending) return
    const fp = getFingerprint()
    setPending(true)
    setPickerOpen(false)
    setHoveredEmoji(null)

    try {
      if (myReaction === emoji) {
        // Clicking the active reaction removes it.
        await apiDeleteAnon(`/api/v1/reactions/${postId}`, { fingerprint: fp })
        setCounts((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }))
        setMyReaction(null)
      } else {
        // Add or switch reaction - backend does an upsert.
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

  function handleTriggerClick() {
    // After a long-press, a synthetic click fires on the trigger. Swallow it so
    // the user's gesture doesn't get double-counted as a default Like.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    handleReact(myReaction ?? '👍')
  }

  if (!showReactions) return null

  // Only show the count row for emojis that have at least one reaction.
  const activeEmojis = EMOJIS.filter((e) => (counts[e] ?? 0) > 0)

  return (
    <div className="pt-3">
      {/* Like button + picker wrapper - hover (desktop) and long-press (touch) both target this. */}
      <div
        ref={containerRef}
        className="relative inline-block"
        // Hover path stays for mouse users. Gated on pointerType so touch devices
        // that emit synthetic mouse events don't accidentally open the picker.
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPickerOpen(true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { setPickerOpen(false); setHoveredEmoji(null) } }}
      >
        {/*
          Outer wrapper: transparent, positioned from bottom-full down to the button top.
          pb-2 fills the visual gap between the pill and the button, so the mouse never
          leaves the container while crossing that space - no mouseleave fires mid-transit.
        */}
        <div
          className={`absolute bottom-full left-0 pb-2 ${
            pickerOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {/* Inner pill: visible styling + slide-up animation. touch-action: none keeps
              the page from scrolling while the user is dragging across emojis. */}
          <div
            role="toolbar"
            aria-label="Reaction picker"
            className={`flex gap-1 rounded-full border border-border bg-surface px-2 py-1.5 shadow-lg transition-all duration-200 ${
              pickerOpen
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-2 scale-90 opacity-0'
            }`}
            style={{ touchAction: 'none' }}
          >
            {EMOJIS.map((emoji, i) => {
              const isMine = myReaction === emoji
              const isHovered = hoveredEmoji === emoji
              return (
                <button
                  key={emoji}
                  type="button"
                  data-emoji={emoji}
                  title={EMOJI_LABEL[emoji]}
                  aria-label={EMOJI_LABEL[emoji]}
                  onClick={() => handleReact(emoji)}
                  // Bigger tap target on mobile (44px / Apple HIG minimum), original
                  // 36px on desktop where mouse precision is higher.
                  className={`flex h-11 w-11 select-none items-center justify-center rounded-full font-display text-2xl transition-transform duration-150 focus:outline-none sm:h-9 sm:w-9 sm:text-xl ${
                    isHovered ? '-translate-y-2 scale-150' : 'hover:scale-125 active:scale-95'
                  } ${isMine ? 'bg-primary/15' : 'hover:bg-muted/20'}`}
                  style={{
                    touchAction: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    transitionDelay: pickerOpen ? `${i * 25}ms` : '0ms',
                  }}
                >
                  {/* Text node wrapped so it can't be hit by the iOS selection magnifier - touches "fall through" to the button. */}
                  <span
                    aria-hidden
                    className="pointer-events-none select-none"
                    style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                  >
                    {emoji}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Primary trigger: shows the current reaction (or default 👍 Like). */}
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          // iOS shows a callout menu on long-press by default - suppress it here
          // since long-press is our gesture.
          onContextMenu={(e) => e.preventDefault()}
          disabled={pending}
          className={`flex select-none items-center gap-1.5 rounded-full border px-4 py-1.5 font-display text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 ${
            myReaction
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
          }`}
          style={{
            touchAction: 'manipulation',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/*
            The emoji text is wrapped in a non-hittable span so iOS doesn't grab it
            as selectable text. Without pointer-events: none here, a long-press on
            the emoji glyph itself triggers iOS Safari's selection magnifier and
            our long-press timer never gets a chance to fire.
          */}
          <span
            aria-hidden
            className="pointer-events-none select-none text-base leading-none"
            style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
          >
            {myReaction ?? '👍'}
          </span>
        </button>
      </div>

      {/* Reaction count bubbles - only rendered when there are reactions. */}
      {activeEmojis.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeEmojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              disabled={pending}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-xs transition-colors disabled:opacity-50 ${myReaction === emoji
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
        <p className="mt-1 font-sans text-xs text-muted">Be the first to react</p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'

interface Props {
  videoUrl: string | null | undefined
}

// Returns null (no DOM nodes) when there is no video or it fails to load.
// The parent hero section's bg-hero-bg is the implicit fallback.
export default function HeroVideo({ videoUrl }: Props) {
  const [failed, setFailed] = useState(false)

  if (!videoUrl || failed) return null

  return (
    <>
      {/* aria-hidden: decorative background; text overlay is the meaningful content */}
      <video
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onError={() => setFailed(true)}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
        aria-hidden
      />
      {/* Darkens the video so the white text meets contrast. The scrim is the
          plum hero color, not neutral black, so the video sinks toward the
          palette instead of toward gray. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-hero-bg/60" />
    </>
  )
}

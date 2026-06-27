interface CakeMarkerProps {
  size?: number
}

// The birthday marker - the Apple-style cake emoji served as a local image
// rather than a raw `🎂` character, so it looks identical on every device
// (not the visitor's OS emoji font) and embeds cleanly in the PNG export.
// Matches the cake on the hand-made paper calendars. Plain <img> (not
// next/image) keeps it export-friendly and trivial for a 64px asset.
export default function CakeMarker({ size = 14 }: CakeMarkerProps) {
  return (
    <img
      src="/emoji/cake.png"
      alt=""
      aria-hidden
      draggable={false}
      className="inline-block shrink-0 select-none"
      style={{ width: size, height: size }}
    />
  )
}

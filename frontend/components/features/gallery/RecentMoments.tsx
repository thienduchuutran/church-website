import Image from 'next/image'
import { Link } from '@/i18n/routing'
import type { Post, PostImage } from '@/lib/types'

// RecentMoments is the homepage photo strip: the newest images across the
// published gallery albums, in arch-topped frames that scroll sideways and
// all lead to /gallery. Real faces are the strongest "stay and browse" pull
// the site has, and the arch is the site's single non-rectangle shape -
// church window, Vietnamese doorway - used only here so it stays special.
//
// Server component. Renders nothing at all when there are no images, so the
// parent decides whether to show a heading and an empty state.

interface Moment {
  image: PostImage
  albumTitle: string
}

// Newest album first, each album's images in their display order, capped.
function collectMoments(albums: Post[], max: number): Moment[] {
  const sorted = [...albums].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const out: Moment[] = []
  for (const album of sorted) {
    const images = [...(album.images ?? [])].sort((a, b) => a.display_order - b.display_order)
    for (const image of images) {
      if (!image.storage_url) continue
      out.push({ image, albumTitle: album.title })
      if (out.length >= max) return out
    }
  }
  return out
}

// Three frame widths cycle so the strip has rhythm instead of a picket fence.
const WIDTHS = ['10rem', '12.5rem', '11rem']

export default function RecentMoments({ albums, max = 8 }: { albums: Post[]; max?: number }) {
  const moments = collectMoments(albums, max)
  if (moments.length === 0) return null

  return (
    // On phones the strip bleeds to the screen edge so the last frame is
    // visibly cut off, which is the affordance that says "this scrolls". From
    // sm up the column is centered with air on both sides, so it stays inside
    // the column and the overflow cut-off does the same job. The vertical
    // padding keeps the card shadows from being clipped by overflow-x.
    <div className="-mx-4 snap-x overflow-x-auto px-4 pb-6 pt-3 [scrollbar-width:thin] sm:mx-0 sm:px-0">
      <ul role="list" className="stagger-children flex gap-4">
        {moments.map(({ image, albumTitle }, i) => (
          <li key={image.id} className="shrink-0 snap-start" style={{ width: WIDTHS[i % WIDTHS.length] }}>
            <Link
              href="/gallery"
              aria-label={albumTitle}
              className="card-lift block overflow-hidden rounded-t-full rounded-b-[14px] bg-panel"
            >
              <div className="relative aspect-[3/4]">
                <Image
                  src={image.storage_url}
                  alt={albumTitle}
                  fill
                  sizes="(max-width: 640px) 45vw, 220px"
                  className="object-cover"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

import type { Post } from '@/lib/types'
import PostCard from './PostCard'

// Horizontally swipeable strip of past events. Each slide is a full-width
// PostCard - identical to the cards in the vertical feeds - so the only
// difference from a normal feed is that you swipe sideways to move between past
// events instead of scrolling down through them. Uses native CSS scroll-snap so
// touch devices get momentum swiping for free (no JS carousel), with each card
// snapping into place. The parent decides how many posts to pass and hides the
// whole section when the list is empty, so this never renders its own empty state.
export default function PastEventsCarousel({ posts }: { posts: Post[] }) {
  return (
    // The vertical padding is not decorative: overflow-x-auto clips on BOTH
    // axes, so without room above and below, each card's resting shadow (and
    // the extra travel it gains on hover) gets sliced off at the scroll edge.
    <div className="snap-x snap-mandatory overflow-x-auto [scrollbar-width:thin] pb-6 pt-3">
      <div className="flex gap-4">
        {posts.map((post) => (
          <div key={post.id} className="w-full shrink-0 snap-start">
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </div>
  )
}

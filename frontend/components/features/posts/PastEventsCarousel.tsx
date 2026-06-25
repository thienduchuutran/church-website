import type { Post } from '@/lib/types'
import PostCard from './PostCard'

// Horizontally swipeable strip of past events. Uses native CSS scroll-snap so
// touch devices get momentum swiping for free - no JS carousel library. Each
// slide is ~85% wide on mobile so the next card "peeks" in, signalling that the
// row is swipeable; it firms up to a fixed width on larger screens. The parent
// decides how many posts to pass and hides the whole section when the list is
// empty, so this component never renders its own empty state.
export default function PastEventsCarousel({ posts }: { posts: Post[] }) {
  return (
    <div className="snap-x snap-mandatory overflow-x-auto [scrollbar-width:thin] pb-3 pt-1">
      <div className="flex gap-4">
        {posts.map((post) => (
          <div key={post.id} className="w-[85%] shrink-0 snap-start sm:w-[340px]">
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </div>
  )
}

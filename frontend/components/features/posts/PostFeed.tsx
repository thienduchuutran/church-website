import type { Post } from '@/lib/types'
import PostCard from './PostCard'
import EmptyState from '@/components/ui/EmptyState'

export default function PostFeed({
  posts,
  emptyMessage = 'No posts yet.',
  emptyHint,
}: {
  posts: Post[]
  emptyMessage?: string
  emptyHint?: string
}) {
  if (posts.length === 0) {
    return <EmptyState title={emptyMessage} hint={emptyHint} />
  }

  return (
    // stagger-children: cards arrive as a sequence on first paint, not a wall.
    <div className="stagger-children grid gap-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

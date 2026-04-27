import type { Post } from '@/lib/types'
import PostCard from './PostCard'

export default function PostFeed({
  posts,
  emptyMessage = 'No posts yet.',
}: {
  posts: Post[]
  emptyMessage?: string
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-surface/50 p-12 text-center">
        <p className="font-sans text-lg leading-relaxed text-muted">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

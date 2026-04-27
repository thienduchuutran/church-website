export type PostType =
  | 'event'
  | 'announcement'
  | 'bible_study'
  | 'playlist'
  | 'gallery_album'

export interface Post {
  id: string
  type: PostType
  title: string
  body: string | null
  event_date: string | null
  external_link: string | null
  admin_id: string | null
  created_at: string
  updated_at: string
  // Backend fills `images` from a join on post_images and presigns each storage_url
  // on the fly. The field is omitted (not empty array) when the post has no images.
  images?: PostImage[]
}

export interface PostImage {
  id: string
  post_id: string
  storage_key: string
  // Short-lived presigned S3 URL (≈1h). Always use this to render the image —
  // never store it long-term, since it expires.
  storage_url: string
  display_order: number
}

export interface ReactionCount {
  emoji: string
  count: number
}

export interface Admin {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

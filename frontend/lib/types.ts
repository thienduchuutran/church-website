export type PostType =
  | 'event'
  | 'announcement'
  | 'bible_study'
  | 'playlist'
  | 'gallery_album'

export interface Tag {
  id: string
  name: string
  created_at: string
}

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
  // Backend populates tags only for gallery_album posts
  tags?: Tag[]
  // True when this response is in a non-English locale AND at least one
  // served field (title or body) came from an unapproved AI translation.
  // Omitted on English responses (the backend uses Go's omitempty). The
  // MachineTranslatedBadge component reads this to decide whether to render.
  machine_translated?: boolean
}

export interface PostImage {
  id: string
  post_id: string
  storage_key: string
  // Short-lived presigned S3 URL (≈1h). Always use this to render the image -
  // never store it long-term, since it expires.
  storage_url: string
  display_order: number
}

export interface ReactionCount {
  emoji: string
  count: number
}

export interface HeroVideo {
  id: string
  file_name: string
  file_size: number | null
  content_type: string | null
  uploaded_by: string | null
  is_active: boolean
  is_visible: boolean
  created_at: string
  // Short-lived presigned S3 URL. Omitted when no S3 creds are configured (dev).
  video_url?: string
}

export interface Admin {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

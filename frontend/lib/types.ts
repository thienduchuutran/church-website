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
  post_images?: PostImage[]
}

export interface PostImage {
  id: string
  post_id: string
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

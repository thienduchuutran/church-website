import { apiDelete, apiGet, apiPatch, apiPost, apiPostMultipart } from './api'
import type { Post, PostType, Tag } from './types'

const POSTS_BASE = '/api/v1/posts'
const TAGS_BASE = '/api/v1/tags'

export interface PostPayload {
  type: PostType
  title: string
  body: string | null
  event_date: string | null
  external_link: string | null
  // Opt the Discord message into pinging @everyone. Honored only on create;
  // the backend ignores it on PATCH. Optional so edit payloads can omit it.
  notify_everyone?: boolean
}

interface ListOptions {
  type?: string
  limit?: number
  tags?: string[]
  // Locale string passed to the backend as `?locale=`. Public read paths
  // (homepage, events, announcements, etc.) should pass the page's locale so
  // translations get served via COALESCE; admin call sites should leave it
  // undefined - admins always work with the English source.
  locale?: string
}

function buildListPath({ type, limit, tags, locale }: ListOptions = {}): string {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (limit !== undefined) params.set('limit', String(limit))
  if (tags && tags.length > 0) params.set('tags', tags.join(','))
  if (locale && locale !== 'en') params.set('locale', locale)
  const qs = params.toString()
  return qs ? `${POSTS_BASE}?${qs}` : POSTS_BASE
}

export async function listPosts(opts: ListOptions = {}): Promise<Post[]> {
  return ((await apiGet(buildListPath(opts))) as Post[]) ?? []
}

// getPost takes an optional locale so public detail views can request the
// translated record. Admins reading a post for editing should call this
// without locale (or with 'en') so the form pre-fills with the English source.
export async function getPost(id: string, locale?: string): Promise<Post> {
  const qs = locale && locale !== 'en' ? `?locale=${encodeURIComponent(locale)}` : ''
  return (await apiGet(`${POSTS_BASE}/${id}${qs}`)) as Post
}

export async function createPost(payload: PostPayload, token: string): Promise<Post> {
  return (await apiPost(POSTS_BASE, payload, token)) as Post
}

export async function updatePost(
  id: string,
  payload: PostPayload,
  token: string,
): Promise<Post> {
  return (await apiPatch(`${POSTS_BASE}/${id}`, payload, token)) as Post
}

export async function deletePost(id: string, token: string): Promise<void> {
  await apiDelete(`${POSTS_BASE}/${id}`, token)
}

// setPostArchived moves an event between the Upcoming and Past sections.
// archived=true stamps archived_at (moves it to Past); false clears it (back to
// Upcoming). Admin-only on the backend. Returns the updated post.
export async function setPostArchived(id: string, archived: boolean, token: string): Promise<Post> {
  return (await apiPatch(`${POSTS_BASE}/${id}/archive`, { archived }, token)) as Post
}

export async function listTags(): Promise<Tag[]> {
  return ((await apiGet(TAGS_BASE)) as Tag[]) ?? []
}

export async function replaceTags(postId: string, tagIds: string[], token: string): Promise<void> {
  await apiPost(`${POSTS_BASE}/${postId}/tags`, { tag_ids: tagIds }, token)
}

export interface ImageUploadResponse {
  key: string
}

export async function uploadImage(postId: string, file: File, token: string): Promise<ImageUploadResponse> {
  const formData = new FormData()
  formData.append('image', file)
  return (await apiPostMultipart(`${POSTS_BASE}/${postId}/images`, formData, token)) as ImageUploadResponse
}

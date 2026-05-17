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
}

interface ListOptions {
  type?: string
  limit?: number
}

function buildListPath({ type, limit }: ListOptions = {}): string {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (limit !== undefined) params.set('limit', String(limit))
  const qs = params.toString()
  return qs ? `${POSTS_BASE}?${qs}` : POSTS_BASE
}

export async function listPosts(opts: ListOptions = {}): Promise<Post[]> {
  return ((await apiGet(buildListPath(opts))) as Post[]) ?? []
}

export async function getPost(id: string): Promise<Post> {
  return (await apiGet(`${POSTS_BASE}/${id}`)) as Post
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

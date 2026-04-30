import { apiDelete, apiGet, apiGetCached, apiPatch, apiPost } from './api'
import type { Post, PostType } from './types'

const POSTS_BASE = '/api/v1/posts'

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

// Fresh fetch — for client components that must always see the latest
// (admin dashboard, edit-modal pre-fill).
export async function listPosts(opts: ListOptions = {}): Promise<Post[]> {
  return ((await apiGet(buildListPath(opts))) as Post[]) ?? []
}

// Server-cached fetch — for server-rendered public pages where stale-by-
// `revalidate`-seconds is acceptable.
export async function listPostsCached(
  opts: ListOptions,
  revalidate: number,
): Promise<Post[]> {
  return ((await apiGetCached(buildListPath(opts), revalidate)) as Post[]) ?? []
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

import type { Post, PostType } from './types'
import type { PostPayload } from './posts'

export interface PostFormState {
  title: string
  body: string
  eventDate: string
  externalLink: string
}

export const EMPTY_POST_FORM: PostFormState = {
  title: '',
  body: '',
  eventDate: '',
  externalLink: '',
}

export const POST_TYPE_FIELDS: Record<string, ('body' | 'event_date' | 'external_link')[]> = {
  event: ['body', 'event_date', 'external_link'],
  announcement: ['body'],
  bible_study: ['body', 'external_link'],
  playlist: ['external_link'],
  gallery_album: ['body', 'external_link'],
}

export const POST_TYPE_LABELS: Record<string, string> = {
  event: 'Event',
  announcement: 'Announcement',
  bible_study: 'Bible Study',
  playlist: 'Playlist',
  gallery_album: 'Gallery Album',
}

export const POST_TYPE_ROUTES: Record<string, string> = {
  event: '/events',
  announcement: '/announcements',
  bible_study: '/resources',
  playlist: '/resources',
  gallery_album: '/gallery',
}

// datetime-local inputs read/write `YYYY-MM-DDTHH:mm` in the user's local
// timezone, while posts store event_date as a UTC ISO string.
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function postToFormState(post: Post): PostFormState {
  return {
    title: post.title,
    body: post.body ?? '',
    eventDate: post.event_date ? isoToDatetimeLocal(post.event_date) : '',
    externalLink: post.external_link ?? '',
  }
}

export function toPostPayload(section: string, state: PostFormState): PostPayload {
  return {
    type: section as PostType,
    title: state.title,
    body: state.body || null,
    event_date: state.eventDate ? new Date(state.eventDate).toISOString() : null,
    external_link: state.externalLink || null,
  }
}

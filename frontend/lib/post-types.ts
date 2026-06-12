import { datetimeLocalToIso, isoToDatetimeLocal } from './date'
import type { Post, PostType } from './types'
import type { PostPayload } from './posts'

export interface PostFormState {
  title: string
  body: string
  eventDate: string
  externalLink: string
  tagIds: string[]
}

export const EMPTY_POST_FORM: PostFormState = {
  title: '',
  body: '',
  eventDate: '',
  externalLink: '',
  tagIds: [],
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

export function postToFormState(post: Post): PostFormState {
  return {
    title: post.title,
    body: post.body ?? '',
    eventDate: post.event_date ? isoToDatetimeLocal(post.event_date) : '',
    externalLink: post.external_link ?? '',
    tagIds: post.tags?.map(t => t.id) ?? [],
  }
}

// eventDate is composed from two optional inputs (date + time), so it can be
// partial: "YYYY-MM-DDT" (no time) or "THH:mm" (no date). A date without a
// time defaults to midnight; a time without a date is meaningless - drop it.
function eventDateToIso(eventDate: string): string | null {
  const [date, time] = eventDate.split('T')
  if (!date) return null
  return datetimeLocalToIso(`${date}T${time || '00:00'}`)
}

export function toPostPayload(section: string, state: PostFormState): PostPayload {
  return {
    type: section as PostType,
    title: state.title,
    body: state.body || null,
    event_date: eventDateToIso(state.eventDate),
    external_link: state.externalLink || null,
  }
}

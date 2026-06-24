import { datetimeLocalToIso, isoToDatetimeLocal } from './date'
import type { Post, PostType } from './types'
import type { PostPayload } from './posts'

export interface PostFormState {
  title: string
  body: string
  eventDate: string
  externalLink: string
  tagIds: string[]
  // Opt this post's Discord message into pinging @everyone. Create-only; the
  // backend ignores it on edit. Defaults false so a normal post never pings.
  notifyEveryone: boolean
}

export const EMPTY_POST_FORM: PostFormState = {
  title: '',
  body: '',
  eventDate: '',
  externalLink: '',
  tagIds: [],
  notifyEveryone: false,
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

// Discord channel each post type is delivered to, for the composer's "this will
// post to #<channel>" note. Mirrors the backend channel mapping in
// docs/agents/discord.md (names only, the leading # is added in the UI).
export const POST_TYPE_DISCORD_CHANNELS: Record<string, string> = {
  event: 'events',
  announcement: 'announcements',
  bible_study: 'friday-bible-studies',
  playlist: 'worship-playlist',
  gallery_album: 'memories',
}

export function postToFormState(post: Post): PostFormState {
  return {
    title: post.title,
    body: post.body ?? '',
    eventDate: post.event_date ? isoToDatetimeLocal(post.event_date) : '',
    externalLink: post.external_link ?? '',
    tagIds: post.tags?.map(t => t.id) ?? [],
    // Not persisted on the post; edits never re-ping, so this stays false.
    notifyEveryone: false,
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
    notify_everyone: state.notifyEveryone,
  }
}

import type { Post } from './types'

// Event sectioning logic, shared by the homepage and the /events page so the two
// can never disagree about what counts as "Upcoming" vs "Past".
//
// The hybrid rule (auto by date + manual):
//   - Past     if the event was manually archived OR its event_date has passed.
//   - Upcoming otherwise. This deliberately INCLUDES dateless events - an event
//              with no event_date used to vanish from the homepage entirely;
//              keeping it Upcoming until an admin archives it is the fix.
//
// `now` is injected (default: current time as an ISO string) so every function
// here is pure and trivially testable. event_date / archived_at arrive from the
// backend as UTC ISO-8601 strings, which sort lexicographically in chronological
// order, so plain string comparison is correct - no Date parsing needed.

export interface PartitionedEvents {
  upcoming: Post[]
  past: Post[]
}

// isUpcoming classifies a single event. Archived events are always Past;
// otherwise an event is Upcoming when it has no date or its date is still ahead.
export function isUpcoming(post: Post, now: string = new Date().toISOString()): boolean {
  if (post.archived_at) return false
  return !post.event_date || post.event_date >= now
}

// canUnarchive reports whether "Move to Upcoming" would actually return the event
// to the Upcoming section. It only would when the event is in Past purely because
// it was archived - if its date has also passed, clearing the flag leaves it in
// Past anyway (the date rule re-files it), so the button should stay hidden.
export function canUnarchive(post: Post, now: string = new Date().toISOString()): boolean {
  return Boolean(post.archived_at) && (!post.event_date || post.event_date >= now)
}

// partitionEvents splits a flat list of event posts into the two display
// sections, each already sorted for rendering.
export function partitionEvents(
  events: Post[],
  now: string = new Date().toISOString(),
): PartitionedEvents {
  const upcoming: Post[] = []
  const past: Post[] = []
  for (const event of events) {
    if (isUpcoming(event, now)) upcoming.push(event)
    else past.push(event)
  }
  return {
    upcoming: upcoming.sort(compareUpcoming),
    past: past.sort(comparePast),
  }
}

// Upcoming order: dated events first, soonest date first (what's next?); dateless
// events sort after them, newest-created first since they have no date to order by.
function compareUpcoming(a: Post, b: Post): number {
  if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date)
  if (a.event_date) return -1
  if (b.event_date) return 1
  return b.created_at.localeCompare(a.created_at)
}

// Past order: most recent first. Recency prefers when the admin archived it, then
// the event's own date, then when it was created - so a just-archived item leads
// the carousel and a future-dated event archived early doesn't jump to the top.
function pastSortKey(post: Post): string {
  return post.archived_at ?? post.event_date ?? post.created_at
}

function comparePast(a: Post, b: Post): number {
  return pastSortKey(b).localeCompare(pastSortKey(a))
}

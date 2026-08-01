import type { CalendarEvent } from '@/components/features/calendar/types'

// Grouping the calendar's events into the venues the Locations strip prints.
//
// The strip used to map 1:1 over every event carrying an address, so eleven
// events at the church printed the church eleven times - and because the strip
// is not export-hidden, that repetition landed in the PNG shared to Discord.
//
// There is no address matching here on purpose. Places are keyed server-side by
// the NORMALIZED address (migration 000014), so two events typed as "101 Main
// St, Saugus MA 01906" and "101 main street, saugus, massachusetts" already
// arrive carrying the same place id. Grouping is therefore a plain group-by on
// that id - all the fuzzy matching lives in one Go function with its own tests,
// rather than being reimplemented here where it could drift.

export interface PlaceGroup {
  // Stable per render, and unique per row - the React key.
  key: string
  // The venue label, or null for an event saved before places existed, which
  // has an address but nothing to call it.
  name: string | null
  address: string
  // Dot colour, taken from the first event at this place.
  color: string
  // Every event held here, in calendar order. The strip links a row straight to
  // its event when there is exactly one, and shows a count when there are more.
  events: CalendarEvent[]
  // True when NO event at this place is public - i.e. the address never appears
  // on the public site. Per-event `address_public` cannot answer this on its
  // own, because one row now stands for several events and they may disagree.
  hiddenFromPublic: boolean
}

// groupEventsByPlace reduces a month's events to one entry per venue, in order
// of first appearance. Events with no location contribute nothing.
export function groupEventsByPlace(events: CalendarEvent[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>()

  for (const e of events) {
    const address = e.place?.address ?? e.private_address ?? ''
    if (!address.trim()) continue

    // An event saved before migration 000014 has an address but no place, and
    // keeps it until it is next saved. Falling back to the trimmed address
    // means such events still print, and identical ones still collapse - but a
    // legacy event will not merge into a resolved place, since one key is a
    // place id and the other is an address. Printing both is the honest
    // outcome, and it resolves itself on the next save.
    const key = e.place ? `place:${e.place.id}` : `address:${address.trim().toLowerCase()}`

    const existing = groups.get(key)
    if (existing) {
      existing.events.push(e)
      if (e.address_public) existing.hiddenFromPublic = false
      continue
    }
    groups.set(key, {
      key,
      name: e.place?.name ?? null,
      address: e.place?.address ?? address,
      color: e.color,
      events: [e],
      hiddenFromPublic: !e.address_public,
    })
  }

  return [...groups.values()]
}

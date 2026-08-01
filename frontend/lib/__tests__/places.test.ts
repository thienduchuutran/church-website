// Run with:  npm run test:places
// (node's built-in runner + native TypeScript stripping - no test dependency)

import test from 'node:test'
import assert from 'node:assert/strict'

import { groupEventsByPlace } from '../places.ts'
import type { CalendarEvent, CalendarPlace } from '../../components/features/calendar/types.ts'

const CHURCH: CalendarPlace = {
  id: 'p-church',
  address: '101 Main St, Saugus, MA 01906',
  name: 'Church',
  name_source: 'ai',
}
const SEBS: CalendarPlace = {
  id: 'p-sebs',
  address: '39 Bridle Ridge Dr, North Grafton, MA 01536',
  name: 'Chris & Sebs',
  name_source: 'ai',
}

// Only the fields grouping actually reads; the rest of CalendarEvent is noise
// here and would make each case unreadable.
function ev(partial: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    date: '2026-05-01',
    title: 'Event',
    event_type: 'general',
    icon: 'star',
    color: 'slate',
    private_address: null,
    notes: null,
    admin_id: null,
    created_at: '',
    updated_at: '',
    source_locale: 'en',
    ...partial,
  } as CalendarEvent
}

test('the whole point: many events at one place produce one row', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', date: '2026-05-08', title: 'Church Clean up/renovation', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '2', date: '2026-05-10', title: 'Church Service 10am', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '3', date: '2026-05-16', title: 'Saturday BBS Church 7pm', place: CHURCH, private_address: CHURCH.address }),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].name, 'Church')
  assert.equal(groups[0].address, '101 Main St, Saugus, MA 01906')
  assert.equal(groups[0].events.length, 3)
})

test('different event names at the same place still collapse', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', title: 'Youth Night', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '2', title: 'Prayer Meeting', place: CHURCH, private_address: CHURCH.address }),
  ])
  assert.equal(groups.length, 1)
})

test('different places stay separate', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '2', place: SEBS, private_address: SEBS.address }),
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.name), ['Church', 'Chris & Sebs'])
})

test('events without any address contribute no rows', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', title: "Girls' Day" }),
    ev({ id: '2', title: 'BCH meeting' }),
  ])
  assert.deepEqual(groups, [])
})

// Every event that existed before migration 000014 has an address but no place,
// and stays that way until it is next saved. It must still print.
test('a pre-migration event with no place falls back to its address', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', title: 'Wednesday Bible Study', private_address: '123 main st' }),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].name, null)
  assert.equal(groups[0].address, '123 main st')
})

test('legacy events sharing an address still collapse on the address', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', private_address: '123 Main St' }),
    ev({ id: '2', private_address: '  123 main st  ' }),
  ])
  assert.equal(groups.length, 1, 'identical legacy addresses should not print twice')
  assert.equal(groups[0].events.length, 2)
})

// A legacy event and a resolved one at the same address cannot be matched -
// the frontend does not normalize, and the legacy row has no place id to match
// on. Printing both is the honest outcome; it resolves itself the moment the
// old event is saved. Pinned so the behaviour is a decision, not a surprise.
test('a legacy event does not merge into a resolved place', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '2', private_address: CHURCH.address }),
  ])
  assert.equal(groups.length, 2)
})

test('rows keep first-appearance order, not alphabetical', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', date: '2026-05-15', place: SEBS, private_address: SEBS.address }),
    ev({ id: '2', date: '2026-05-16', place: CHURCH, private_address: CHURCH.address }),
  ])
  assert.deepEqual(groups.map((g) => g.name), ['Chris & Sebs', 'Church'])
})

test('the group carries the first event, so a single-event row can link to it', () => {
  const groups = groupEventsByPlace([
    ev({ id: 'first', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: 'second', place: CHURCH, private_address: CHURCH.address }),
  ])
  assert.equal(groups[0].events[0].id, 'first')
})

// address_public is per event, but the strip renders one row per place. The row
// is only "hidden from the public site" when NO event there is public - if any
// one of them is, the address does appear publicly.
test('a place is hidden only when every event at it is private', () => {
  const allPrivate = groupEventsByPlace([
    ev({ id: '1', place: CHURCH, private_address: CHURCH.address, address_public: false }),
    ev({ id: '2', place: CHURCH, private_address: CHURCH.address, address_public: false }),
  ])
  assert.equal(allPrivate[0].hiddenFromPublic, true)

  const onePublic = groupEventsByPlace([
    ev({ id: '1', place: CHURCH, private_address: CHURCH.address, address_public: false }),
    ev({ id: '2', place: CHURCH, private_address: CHURCH.address, address_public: true }),
  ])
  assert.equal(onePublic[0].hiddenFromPublic, false)
})

test('the row takes its dot colour from the first event at the place', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', color: 'rose', place: CHURCH, private_address: CHURCH.address }),
    ev({ id: '2', color: 'sky', place: CHURCH, private_address: CHURCH.address }),
  ])
  assert.equal(groups[0].color, 'rose')
})

// A public visitor's payload has place and private_address both stripped on
// private events, so those must simply vanish rather than render an empty row.
test('a stripped event renders nothing', () => {
  const groups = groupEventsByPlace([
    ev({ id: '1', private_address: null, place: null }),
    ev({ id: '2', private_address: '', place: null }),
  ])
  assert.deepEqual(groups, [])
})

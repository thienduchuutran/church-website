import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventTypeDef,
  CalendarMonthNote,
  CalendarMonthResponse,
  CalendarMonthSettings,
  CalendarPlace,
  CalendarSeries,
  PaletteColor,
  RecurrenceRule,
  WriteScope,
} from '@/components/features/calendar/types'

const BASE = '/api/v1/calendar'

// getMonth accepts an optional locale so viewers see translated event titles,
// notes, and the month note. EVERY viewer passes the locale they picked, admins
// included - the calendar is a display surface, and an admin on /vi should see
// what the congregation sees.
//
// The accessToken is a separate concern: when present it opts the request into
// the OptionalAdmin middleware path, which reveals admin-only fields -
// private_address, plus title_source/notes_source/content_source carrying the
// untranslated English that EventModal pre-fills from. That pairing is what lets
// an admin view Vietnamese and still save English; see CalendarShell.
//
// Note this deliberately differs from lib/posts.ts, where admin call sites omit
// the locale. Those are edit surfaces (the dashboard list feeds the edit modal
// directly), so they want the source in the display field itself.
export async function getMonth(
  year: number,
  month: number,
  accessToken?: string | null,
  locale?: string,
): Promise<CalendarMonthResponse> {
  const params = new URLSearchParams({ year: String(year), month: String(month) })
  if (locale && locale !== 'en') params.set('locale', locale)
  return apiGet(`${BASE}?${params.toString()}`, accessToken) as Promise<CalendarMonthResponse>
}

// No language field on any write. The backend detects the source language from
// the submitted text (majority of words wins) and sets source_locale itself, so
// there is nothing for a client to declare or get wrong.
export async function createEvent(
  payload: {
    date: string
    end_date?: string | null
    title: string
    event_type: CalendarEventType
    icon: string
    color: string
    private_address?: string | null
    address_public?: boolean
    notes: string | null
    // Turns this create into a series. Omitted for a one-off. The occurrences
    // are generated server-side - the client never computes dates and never
    // sends more than this single event.
    recurrence?: RecurrenceRule | null
    // The admin's "Ends on" date. Omitted means open-ended, which is the only
    // case that ever needs extending later.
    recurrence_until?: string | null
  },
  token: string,
): Promise<CalendarEvent> {
  return apiPost(`${BASE}/events`, payload, token) as Promise<CalendarEvent>
}

export async function updateEvent(
  id: string,
  payload: {
    title?: string
    event_type?: CalendarEventType
    icon?: string
    color?: string
    private_address?: string | null
    address_public?: boolean
    notes?: string | null
    // Always sent on edit (a date string or null) because the backend writes
    // end_date directly - omitting it would clear an existing span.
    end_date?: string | null
    // Changes how the series repeats. Send null to leave the rule untouched;
    // an empty string means "stop repeating", which keeps the dates already on
    // the calendar and only stops generating more. Accepted only with
    // scope=series, because a new rule rebuilds the whole series' future.
    recurrence?: RecurrenceRule | null
    recurrence_until?: string | null
    // Required when recurrence is set to '' (turning repeating off), rejected
    // otherwise. 'keep' leaves every generated date alone; 'future' also
    // removes the ones that have not happened yet. The backend refuses a
    // missing value rather than choosing - "stop repeating" has two reasonable
    // meanings and only the admin knows which one they meant.
    recurrence_cleanup?: 'keep' | 'future' | null
  },
  scope: WriteScope,
  token: string,
): Promise<CalendarEvent> {
  return apiPatch(`${BASE}/events/${id}?scope=${scope}`, payload, token) as Promise<CalendarEvent>
}

// scope is required, not optional, and is a query parameter on both the edit
// and the delete. The backend rejects a request without one instead of picking
// a default, so there is no call site that can quietly mean "all events" when
// it meant "this one".
export async function deleteEvent(id: string, scope: WriteScope, token: string): Promise<void> {
  await apiDelete(`${BASE}/events/${id}?scope=${scope}`, token)
}

// --- Recurring series (the admin's view of what repeats) ---

// Admin-only, like getPlaces: it describes the calendar's internals rather than
// its contents, and lists every series whether or not its events are public.
export async function getSeries(token: string): Promise<CalendarSeries[]> {
  return apiGet(`${BASE}/series`, token) as Promise<CalendarSeries[]>
}

// Tops a series up by another horizon's worth of dates. Purely additive - it
// only ever appends future occurrences, never moves or removes one - which is
// why it takes no scope and needs no confirmation, unlike every other write on
// the calendar.
export async function extendSeries(id: string, token: string): Promise<{ added: number }> {
  return apiPost(`${BASE}/series/${id}/extend`, {}, token) as Promise<{ added: number }>
}

// --- Places (the venue registry behind the Locations strip) ---

// Admin-only, unlike getEventTypes/getPaletteColors below. Those are public
// lists of labels and hex codes; this one returns street addresses including
// every address never marked "show on website", so the token is required rather
// than optional.
export async function getPlaces(token: string): Promise<CalendarPlace[]> {
  return apiGet(`${BASE}/places`, token) as Promise<CalendarPlace[]>
}

// Renames a venue. One call relabels every event at that address, because the
// name lives on the place rather than on each event - and it pins the label so
// the naming model can never overwrite it again.
export async function renamePlace(id: string, name: string, token: string): Promise<CalendarPlace> {
  return apiPatch(`${BASE}/places/${id}`, { name }, token) as Promise<CalendarPlace>
}

// --- Event types (the admin-managed category vocabulary) ---

// Public read - the day modal needs the labels to name an event's category to
// visitors, so this deliberately takes no token.
export async function getEventTypes(): Promise<CalendarEventTypeDef[]> {
  return apiGet('/api/v1/calendar/event-types') as Promise<CalendarEventTypeDef[]>
}

// Creates a reusable event type from an admin-typed label. The slug is derived
// server-side from the label, which makes this get-or-create: two admins who
// both type "Baptism" converge on one type instead of near-duplicates.
export async function createEventType(
  payload: { label: string; default_icon: string; default_color: string },
  token: string,
): Promise<CalendarEventTypeDef> {
  return apiPost('/api/v1/calendar/event-types', payload, token) as Promise<CalendarEventTypeDef>
}

// --- Palette colors (the shared custom swatch grid) ---

export async function getPaletteColors(): Promise<PaletteColor[]> {
  return apiGet('/api/v1/calendar/palette') as Promise<PaletteColor[]>
}

// Saves a swatch for every admin to reuse. Idempotent server-side, so adding a
// color that is already saved returns the existing swatch rather than erroring.
export async function createPaletteColor(hex: string, token: string): Promise<PaletteColor> {
  return apiPost('/api/v1/calendar/palette', { hex }, token) as Promise<PaletteColor>
}

// Removes a swatch from the picker only. Events already using that hex keep it -
// the color is copied onto the event, never referenced - so this never repaints
// the calendar.
export async function deletePaletteColor(id: string, token: string): Promise<void> {
  await apiDelete(`/api/v1/calendar/palette/${id}`, token)
}

// The four fields an admin edits together in the month modal. Passed as an
// object rather than four positional strings, because four same-typed
// parameters in a row is a call-site bug waiting to happen - swapping the verse
// and its reference would type-check perfectly.
export interface MonthNoteInput {
  content: string
  theme: string
  verse_text: string
  verse_reference: string
  /**
   * The same verse in the other language, filed as a human-authored, already
   * approved translation rather than queued for the model.
   *
   * The month modal does not currently collect it - the verse shows in the
   * language it was written in on both locales. The backend still accepts it,
   * so offering a second verse box again is a UI-only change. Omitting the key
   * clears any wording previously stored for the other locale.
   */
  verse_text_alt?: string
}

export async function upsertMonthNote(
  year: number,
  month: number,
  fields: MonthNoteInput,
  token: string,
): Promise<CalendarMonthNote> {
  return apiPut(`${BASE}/months/${year}/${month}/note`, fields, token) as Promise<CalendarMonthNote>
}

export async function upsertMonthSettings(
  year: number,
  month: number,
  accentColor: string,
  token: string,
): Promise<CalendarMonthSettings> {
  return apiPut(
    `${BASE}/months/${year}/${month}/settings`,
    { accent_color: accentColor },
    token,
  ) as Promise<CalendarMonthSettings>
}

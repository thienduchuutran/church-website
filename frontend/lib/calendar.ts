import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventTypeDef,
  CalendarMonthNote,
  CalendarMonthResponse,
  CalendarMonthSettings,
  PaletteColor,
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
  },
  token: string,
): Promise<CalendarEvent> {
  return apiPatch(`${BASE}/events/${id}`, payload, token) as Promise<CalendarEvent>
}

export async function deleteEvent(id: string, token: string): Promise<void> {
  await apiDelete(`${BASE}/events/${id}`, token)
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

export async function upsertMonthNote(
  year: number,
  month: number,
  content: string,
  token: string,
): Promise<CalendarMonthNote> {
  return apiPut(`${BASE}/months/${year}/${month}/note`, { content }, token) as Promise<CalendarMonthNote>
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

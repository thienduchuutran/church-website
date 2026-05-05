import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api'
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarMonthNote,
  CalendarMonthResponse,
  CalendarMonthSettings,
} from '@/components/features/calendar/types'

const BASE = '/api/v1/calendar'

export async function getMonth(year: number, month: number, accessToken?: string | null): Promise<CalendarMonthResponse> {
  return apiGet(`${BASE}?year=${year}&month=${month}`, accessToken) as Promise<CalendarMonthResponse>
}

export async function createEvent(
  payload: {
    date: string
    title: string
    event_type: CalendarEventType
    icon: string
    color: string
    private_address?: string | null
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
    notes?: string | null
  },
  token: string,
): Promise<CalendarEvent> {
  return apiPatch(`${BASE}/events/${id}`, payload, token) as Promise<CalendarEvent>
}

export async function deleteEvent(id: string, token: string): Promise<void> {
  await apiDelete(`${BASE}/events/${id}`, token)
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

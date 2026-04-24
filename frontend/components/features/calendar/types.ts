export type CalendarEventType = 'birthday' | 'bible_study' | 'general' | 'announcement' | 'prayer'

export interface CalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  title: string
  event_type: CalendarEventType
  icon: string
  color: string
  notes: string | null
  admin_id: string | null
  created_at: string
  updated_at: string
}

export interface CalendarMonthNote {
  id: string
  year: number
  month: number
  content: string
  admin_id: string | null
  created_at: string
  updated_at: string
}

export interface CalendarMonthResponse {
  events: CalendarEvent[]
  month_note: CalendarMonthNote | null
}

// Maps color keys to CSS hex values — used with inline styles to avoid
// Tailwind purging dynamically-constructed class names.
export const COLOR_MAP: Record<string, { dot: string; text: string; bg: string }> = {
  slate:   { dot: '#64748b', text: '#475569', bg: '#f1f5f9' },
  red:     { dot: '#ef4444', text: '#dc2626', bg: '#fef2f2' },
  amber:   { dot: '#f59e0b', text: '#d97706', bg: '#fffbeb' },
  emerald: { dot: '#10b981', text: '#059669', bg: '#ecfdf5' },
  sky:     { dot: '#0ea5e9', text: '#0284c7', bg: '#f0f9ff' },
  violet:  { dot: '#8b5cf6', text: '#7c3aed', bg: '#f5f3ff' },
  rose:    { dot: '#f43f5e', text: '#e11d48', bg: '#fff1f2' },
  stone:   { dot: '#78716c', text: '#57534e', bg: '#fafaf9' },
}

export const ICON_LABELS: Record<string, string> = {
  'cake':        'Birthday',
  'book-open':   'Bible Study',
  'bell':        'Announcement',
  'heart':       'Heart',
  'star':        'Star',
  'users':       'Gathering',
  'music-notes': 'Music',
  'cross':       'Service',
  'flame':       'Prayer',
  'sparkle':     'Special',
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  birthday:     'Birthday',
  bible_study:  'Bible Study',
  general:      'General',
  announcement: 'Announcement',
  prayer:       'Prayer',
}

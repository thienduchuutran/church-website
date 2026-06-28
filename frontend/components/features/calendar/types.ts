export type CalendarEventType = 'birthday' | 'bible_study' | 'general' | 'announcement' | 'prayer' | 'graduation'

export interface CalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  // Inclusive last day of a multi-day span (YYYY-MM-DD). Omitted/null for a
  // single-day event. Drives the banner ribbon in the grid.
  end_date?: string | null
  title: string
  event_type: CalendarEventType
  icon: string
  color: string
  private_address: string | null
  notes: string | null
  admin_id: string | null
  created_at: string
  updated_at: string
  // True when this event's title or notes came from an unapproved AI
  // translation. Omitted on English responses. Drives the badge in the
  // calendar tile.
  machine_translated?: boolean
}

export interface CalendarMonthNote {
  id: string
  year: number
  month: number
  content: string
  admin_id: string | null
  created_at: string
  updated_at: string
  // Same semantics as CalendarEvent.machine_translated - applies to the
  // sidebar note's content field.
  machine_translated?: boolean
}

export interface CalendarMonthSettings {
  id: string
  year: number
  month: number
  accent_color: string
  admin_id: string | null
  created_at: string
  updated_at: string
}

export interface CalendarMonthResponse {
  events: CalendarEvent[]
  month_note: CalendarMonthNote | null
  month_settings: CalendarMonthSettings | null
}

// Curated swatches the admin picker offers as one-click options. All five live
// inside the site's design palette so an admin who clicks "Plum" or "Dusk"
// still lands on a brand-coherent color. The native color input is offered
// alongside for the rare case they want something off-palette.
export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Terracotta', hex: '#C4663C' },
  { label: 'Sage', hex: '#4A7A5C' },
  { label: 'Gold', hex: '#C49A3C' },
  { label: 'Plum', hex: '#7C3A6E' },
  { label: 'Dusk', hex: '#3A5C7C' },
]

// Each month gets its own distinct identity color - the way the hand-made
// paper calendars give May a purple, March a green, December a red. The set is
// kept vivid-but-earthy so it still reads on-brand (no neon) and mirrors the
// printout where the congregation already knows the color: Feb pink, Mar
// green, Apr gold, May purple, Dec red. These are DEFAULTS only - the admin
// accent picker (DB-backed month_settings) overrides any month it touches.
// headerText is white except on the lighter gold/amber tones, which take the
// dark base for contrast.
const DARK_BASE = '#1C1210'

export const MONTH_THEMES: Record<number, { title: string; header: string; headerText: string }> = {
  1: { title: '#3A5C7C', header: '#3A5C7C', headerText: '#ffffff' }, // Dusk blue - winter
  2: { title: '#C24E7D', header: '#C24E7D', headerText: '#ffffff' }, // Rose - Valentine's
  3: { title: '#4A7A5C', header: '#4A7A5C', headerText: '#ffffff' }, // Sage - spring
  4: { title: '#C49A3C', header: '#C49A3C', headerText: DARK_BASE },  // Gold - Easter
  5: { title: '#7C5AA6', header: '#7C5AA6', headerText: '#ffffff' }, // Plum - May
  6: { title: '#C4663C', header: '#C4663C', headerText: '#ffffff' }, // Terracotta - early summer
  7: { title: '#C2503C', header: '#C2503C', headerText: '#ffffff' }, // Coral red - summer
  8: { title: '#3C8C82', header: '#3C8C82', headerText: '#ffffff' }, // Teal - late summer
  9: { title: '#B8742C', header: '#B8742C', headerText: '#ffffff' }, // Amber rust - fall
  10: { title: '#B85C2E', header: '#B85C2E', headerText: '#ffffff' }, // Pumpkin - October
  11: { title: '#97463C', header: '#97463C', headerText: '#ffffff' }, // Brick - November
  12: { title: '#B83C3C', header: '#B83C3C', headerText: '#ffffff' }, // Christmas red - December
}

// Maps color keys to CSS hex values - used with inline styles to avoid
// Tailwind purging dynamically-constructed class names.
//   dot       - the saturated category color (legend dots, accents)
//   text      - bold body text; 700-level so it reads on the highlight tint
//   bg        - faint 50-level wash (kept for any low-emphasis surface)
//   highlight - the "highlighter swipe" marker tint (200-level) behind event
//               titles in the grid, echoing the hand-made paper calendars
export const COLOR_MAP: Record<string, { dot: string; text: string; bg: string; highlight: string }> = {
  slate: { dot: '#64748b', text: '#475569', bg: '#f1f5f9', highlight: '#cbd5e1' },
  red: { dot: '#ef4444', text: '#b91c1c', bg: '#fef2f2', highlight: '#fecaca' },
  amber: { dot: '#f59e0b', text: '#b45309', bg: '#fffbeb', highlight: '#fde68a' },
  emerald: { dot: '#10b981', text: '#047857', bg: '#ecfdf5', highlight: '#a7f3d0' },
  sky: { dot: '#0ea5e9', text: '#0369a1', bg: '#f0f9ff', highlight: '#bae6fd' },
  violet: { dot: '#8b5cf6', text: '#6d28d9', bg: '#f5f3ff', highlight: '#ddd6fe' },
  rose: { dot: '#f43f5e', text: '#be123c', bg: '#fff1f2', highlight: '#fecdd3' },
  stone: { dot: '#78716c', text: '#57534e', bg: '#fafaf9', highlight: '#e7e5e4' },
  // Black - the paper calendars' banner-bar color. `text` is near-black so a
  // multi-day ribbon fills near-black with white text; a single-day chip shows
  // dark text on the light-gray `highlight`.
  black: { dot: '#171717', text: '#171717', bg: '#fafafa', highlight: '#d4d4d4' },
}

export const ICON_LABELS: Record<string, string> = {
  'cake': 'Birthday',
  'book-open': 'Bible Study',
  'bell': 'Announcement',
  'heart': 'Heart',
  'star': 'Star',
  'users': 'Gathering',
  'music-notes': 'Music',
  'cross': 'Service',
  'flame': 'Prayer',
  'sparkle': 'Special',
  'graduation-cap': 'Graduation',
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  birthday: 'Birthday',
  bible_study: 'Bible Study',
  general: 'General',
  announcement: 'Announcement',
  prayer: 'Prayer',
  graduation: 'Graduation',
}

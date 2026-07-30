import { deriveRamp, isHexColor, type ColorRamp } from '@/lib/color'

// An event type is now an opaque slug, not a closed union: admins create types
// at runtime (migration 000012 moved the vocabulary from a Postgres enum into
// the calendar_event_types table). The six built-ins below are still named in
// BUILTIN_EVENT_TYPE_LABELS because a few components branch on 'birthday'.
export type CalendarEventType = string

// One row of the admin-managed event-type vocabulary, as served by
// GET /api/v1/calendar/event-types.
export interface CalendarEventTypeDef {
  slug: string
  label: string
  // The icon and color a new event of this type starts with. Data, not code -
  // which is what lets an admin-created type feel designed from the first use.
  default_icon: string
  default_color: string
  is_builtin: boolean
  sort_order: number
  admin_id: string | null
  created_at: string
  updated_at: string
}

// One saved swatch in the shared custom palette (GET /api/v1/calendar/palette).
// Deliberately unnamed - the color is its own label.
export interface PaletteColor {
  id: string
  hex: string
  sort_order: number
  admin_id: string | null
  created_at: string
}

// The sentinel for "this event shows no icon" - a real selectable state in the
// picker rather than an empty string, matching the backend's model.IconNone.
export const ICON_NONE = 'none'

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
  // Whether private_address is shown on the public website. The export always
  // includes the address regardless of this flag.
  address_public?: boolean
  notes: string | null
  admin_id: string | null
  created_at: string
  updated_at: string
  // True when this event's title or notes came from an unapproved AI
  // translation. Omitted on English responses. Drives the badge in the
  // calendar tile.
  machine_translated?: boolean
  // The authored text behind a possibly-translated title/notes - whatever
  // language the admin actually wrote it in, which since migration 000013 is not
  // necessarily English. Present only on a response fetched with an admin token;
  // absent when the viewer's locale already matches source_locale (title/notes
  // then ARE the source) and for public visitors. EventModal pre-fills from
  // these so an edit always modifies the source - never read them for display.
  title_source?: string | null
  notes_source?: string | null
  // Which language title/notes are written in. Drives the direction of both the
  // read path and the translation job, and seeds the edit form's language
  // control so a correction is not re-detected away on the next save.
  source_locale: SourceLocale
}

// The languages a record can be authored in. Mirrors the backend's
// normalizeLocale, which collapses anything unrecognized to 'en'.
export type SourceLocale = 'en' | 'vi'

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
  // Same semantics as CalendarEvent.title_source - the authored source the Notes
  // modal edits while the sidebar displays the translation.
  content_source?: string | null
  // See CalendarEvent.source_locale.
  source_locale: SourceLocale
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

// resolveColor is the single entry point every renderer uses to turn a stored
// color into the four values it paints with. A stored color is either a
// built-in palette key ('rose') or an admin's custom hex ('#2E7D9A'); this hides
// that difference so no component has to know which it got.
//
// Built-in keys keep their hand-tuned values; a hex is expanded by deriveRamp,
// which guarantees the derived text color clears WCAG AA against both white and
// its own highlight tint. Anything unrecognized falls back to slate rather than
// rendering an event invisible.
export function resolveColor(color: string): ColorRamp {
  const builtin = COLOR_MAP[color]
  if (builtin) return builtin
  if (isHexColor(color)) return deriveRamp(color)
  return COLOR_MAP.slate
}

export const ICON_LABELS: Record<string, string> = {
  [ICON_NONE]: 'No icon',
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

// Labels for the six built-in types. The authoritative list now comes from
// GET /calendar/event-types, but keeping these means a type chip or a day-modal
// row renders its proper label immediately instead of flashing a raw slug while
// that request is in flight.
export const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: 'Birthday',
  bible_study: 'Bible Study',
  general: 'General',
  announcement: 'Announcement',
  prayer: 'Prayer',
  graduation: 'Graduation',
}

// Turn a slug into something human-readable, preferring the fetched vocabulary,
// then the built-in labels, and finally de-slugging the key itself so a custom
// type never surfaces to a visitor as `fellowship_meal`.
export function eventTypeLabel(slug: string, defs?: CalendarEventTypeDef[]): string {
  const def = defs?.find((d) => d.slug === slug)
  if (def) return def.label
  if (EVENT_TYPE_LABELS[slug]) return EVENT_TYPE_LABELS[slug]
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

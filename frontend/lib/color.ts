// Color math for admin-chosen custom event colors.
//
// The built-in palette keys in `components/features/calendar/types.ts` each ship
// four hand-tuned values. A custom hex arrives as a single value, so the rest of
// the ramp has to be derived - and derived *safely*, because the calendar paints
// text on top of these colors in two different directions:
//
//   EventChip   - fills with `highlight`, writes `text` on top of it
//   EventBanner - fills with `text`,      writes white on top of it
//
// So `text` must clear WCAG AA (4.5:1) against BOTH white and `highlight`, or an
// admin picks a pretty color and the calendar becomes unreadable. That two-sided
// constraint is the entire reason this file exists rather than a one-line tint.

export interface ColorRamp {
  // The saturated identity color - legend dots and picker swatches. This is the
  // admin's exact choice, never adjusted, so the swatch matches what they picked.
  dot: string
  // Bold body text, and the multi-day banner fill (which writes white on itself).
  text: string
  // Faint wash for low-emphasis surfaces.
  bg: string
  // The "highlighter swipe" marker tint behind event titles in the grid.
  highlight: string
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

/** True for the exact 6-digit form we store. Mirrors the Go-side regex. */
export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

/**
 * Accepts what a human types into a hex field ("abc", "#abc", "2e7d9a") and
 * returns the canonical stored form, or null if it is not a color at all.
 * Shorthand is expanded because the backend and the DB CHECK both accept only
 * the 6-digit form.
 */
export function normalizeHexInput(raw: string): string | null {
  let v = raw.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{3}$/.test(v)) {
    v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2]
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(v)) return null
  return `#${v.toUpperCase()}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (c: number) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0').toUpperCase()
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

/** RGB (0-255) to HSL with h in degrees and s/l as percentages. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = hexToRgb(hex)
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return { h: 0, s: 0, l: l * 100 }

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  switch (max) {
    case r:
      h = ((g - b) / d) % 6
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
  }
  h *= 60
  if (h < 0) h += 360
  return { h, s: s * 100, l: l * 100 }
}

/** HSL (deg, %, %) back to a 6-digit hex. */
export function hslToHex(h: number, s: number, l: number): string {
  const sN = clamp(s, 0, 100) / 100
  const lN = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = lN - c / 2

  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
}

/** WCAG 2.1 relative luminance. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio between two hex colors: 1 (identical) to 21 (black/white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG AA for normal text. */
export const AA_CONTRAST = 4.5

const WHITE = '#FFFFFF'

/**
 * Expand a single admin-chosen hex into the four-value ramp the calendar needs.
 *
 * `text` starts at a mid-dark lightness and is walked darker until it clears AA
 * against both white and the derived `highlight`. Saturation is clamped rather
 * than copied so that near-grey picks still read as deliberate and neon picks
 * still read as ink rather than glare.
 *
 * The loop always terminates: by L=10% every hue is dark enough to clear AA
 * against both a white and an 80%-lightness backdrop.
 */
export function deriveRamp(hex: string): ColorRamp {
  const { h, s } = hexToHsl(hex)

  const highlight = hslToHex(h, clamp(s, 25, 85), 80)
  const bg = hslToHex(h, clamp(s, 15, 60), 96)

  const textS = clamp(s, 35, 90)
  let textL = 35
  let text = hslToHex(h, textS, textL)
  while (
    textL > 10 &&
    (contrastRatio(text, WHITE) < AA_CONTRAST || contrastRatio(text, highlight) < AA_CONTRAST)
  ) {
    textL -= 2
    text = hslToHex(h, textS, textL)
  }

  return { dot: hex.toUpperCase(), text, bg, highlight }
}

'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { deriveRamp } from '@/lib/color'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'
import { CalendarMonthNote } from './types'

interface MonthThemeCardProps {
  note: CalendarMonthNote | null
  /** The month's active accent - the same value the headline and grid header use. */
  accent: string
  isAdmin: boolean
  /** Opens the month modal in `note` mode; the shell owns that state. */
  onEdit: () => void
}

/**
 * The month's theme and memory verse, rendered between the month navigation and
 * the calendar grid.
 *
 * Why it sits here and not in the info strip below the grid, where the note
 * already lives: the strip is a footnote, and a footnote is the right rank for
 * logistics ("bring guests", an address) but the wrong rank for the frame the
 * rest of the month hangs on. The two split by kind rather than by table - one
 * `calendar_month_notes` row still backs both.
 *
 * Why one card rather than two: theme and verse are the same kind of content at
 * different lengths. Two separate blocks would read as two things each asking
 * for attention; one block with two zones reads as "this month's focus", which
 * is what it is.
 */
export default function MonthThemeCard({ note, accent, isAdmin, onEdit }: MonthThemeCardProps) {
  // The card's own chrome is translated; the theme and verse themselves arrive
  // already in the right language from the API. The rest of CalendarShell is
  // still hardcoded English - a pre-existing gap, tracked separately.
  const t = useTranslations('Calendar')
  const ink = useAccentInk(accent)

  const theme = note?.theme?.trim() ?? ''
  const verse = note?.verse_text?.trim() ?? ''
  const reference = note?.verse_reference?.trim() ?? ''
  const hasContent = theme !== '' || verse !== ''

  // A visitor sees nothing at all when the month has no theme - no empty shell,
  // matching how the info strip below hides itself rather than printing "None
  // this month" for a section that was never filled in.
  if (!hasContent) {
    if (!isAdmin) return null
    return (
      <button
        type="button"
        onClick={onEdit}
        data-export-hide
        className="w-full mb-3 px-4 py-3 flex items-center gap-2 border-2 border-dashed transition-colors hover:bg-panel/40"
        style={{ borderColor: ink, backgroundColor: `${accent}12` }}
      >
        <span className="font-display text-base leading-none" style={{ color: ink }}>+</span>
        <span className="font-display text-xs font-bold" style={{ color: ink }}>
          {t('addThemeVerse')}
        </span>
      </button>
    )
  }

  return (
    <div
      className="relative mb-3 border-2 border-foreground grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* Theme and verse each own a cell, so the 1:2 split only exists when both
          are filled. With one of them empty the single cell spans the card and
          the divider never prints against dead space. */}
      {theme !== '' && (
        <div className={`px-4 py-3 min-w-0 ${verse !== '' ? '@xl:border-r-2 @xl:border-foreground' : ''}`}>
          <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: ink }}>
            {t('themeLabel')}
          </p>
          <p className="font-serif text-lg @xl:text-xl font-bold leading-tight text-foreground text-balance m-0">
            {theme}
          </p>
        </div>
      )}

      {verse !== '' && (
        <div
          className={`px-4 py-3 min-w-0 ${theme !== '' ? 'border-t-2 border-foreground @xl:border-t-0' : ''}`}
        >
          <p className="font-display text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: ink }}>
            {t('verseLabel')}
          </p>
          {/* Plain text, not HTML - the verse never passes through sanitizeBody
              because it never contains markup. */}
          <p className="font-sans text-[13px] leading-relaxed text-muted m-0">{verse}</p>
          {reference !== '' && (
            <p className="font-display text-[11.5px] font-bold tracking-wide mt-1 m-0" style={{ color: ink }}>
              {reference}
            </p>
          )}
        </div>
      )}

      {/* card_machine_translated, not machine_translated: the latter describes
          the freeform note in the strip below the grid, which this card does
          not display. A badge must answer for the text beside it. */}
      {note?.card_machine_translated && (
        <div className="@xl:col-span-2 px-4 pb-2 -mt-1">
          <MachineTranslatedBadge />
        </div>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={onEdit}
          data-export-hide
          aria-label={t('editThemeVerse')}
          className="absolute top-1 right-2 font-display text-[9px] text-muted/80 hover:text-foreground underline underline-offset-2 transition-colors"
        >
          {t('edit')}
        </button>
      )}
    </div>
  )
}

/**
 * The accent, darkened (or lightened) until small text painted with it is
 * actually readable on the page ground.
 *
 * Three of the twelve month accents fail WCAG AA as 9px text on `--background`:
 * April's `#BEB5FA` at 1.78:1, October's `#B25A73` at 4.32:1, and any custom
 * lavender an admin picks. `deriveRamp` already solves exactly this - it walks a
 * hex darker in 2% steps until it clears 4.5:1 - so this is reuse rather than
 * new colour maths.
 *
 * The wrinkle `deriveRamp` does not cover: its `text` value is always dark,
 * because it was written for event chips that supply their own light `highlight`
 * fill to sit on. This card paints straight onto the page ground, which is
 * `#17101a` in dark mode, where dark ink disappears. So dark mode takes the
 * light end of the same ramp - same hue, opposite end.
 *
 * Resolved in an effect rather than during render because the server has no
 * `matchMedia`; the first paint uses the light-mode ink, which is also the right
 * answer for every viewer not in dark mode.
 */
function useAccentInk(accent: string): string {
  const ramp = deriveRamp(accent)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setDark(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return dark ? ramp.highlight : ramp.text
}

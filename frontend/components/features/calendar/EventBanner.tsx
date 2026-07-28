import { resolveColor } from './types'

interface EventBannerProps {
  title: string
  color: string
  // Round only the true ends of the span. A segment that continues into the
  // next week leaves its inner end square so the run reads as continuous.
  roundStart: boolean
  roundEnd: boolean
  tooltip?: string
}

// A multi-day event ribbon: a solid category-colored bar spanning the days it
// covers, like the banner events on the hand-made paper calendars ("Youth Camp
// May 22-25"). One segment is rendered per week row by CalendarGrid. The bar
// uses the category's dark text color as its fill with white text so every
// category reads as a bold ribbon.
export default function EventBanner({ title, color, roundStart, roundEnd, tooltip }: EventBannerProps) {
  // colors.text doubles as this ribbon's fill, and it is guaranteed to clear
  // WCAG AA against the white text below - see deriveRamp in lib/color.ts.
  const colors = resolveColor(color)
  return (
    <div
      title={tooltip ?? title}
      className={[
        'flex h-full items-center justify-center px-2 font-display text-[11px] font-bold leading-none text-white truncate',
        roundStart ? 'rounded-l-[5px] ml-[2px]' : '',
        roundEnd ? 'rounded-r-[5px] mr-[2px]' : '',
      ].join(' ')}
      style={{ backgroundColor: colors.text }}
    >
      <span className="truncate">{title}</span>
    </div>
  )
}

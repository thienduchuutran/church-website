import CalendarIcon from './CalendarIcon'
import CakeMarker from './CakeMarker'
import { COLOR_MAP } from './types'

interface EventChipProps {
  title: string
  icon: string
  color: string
  // Native hover tooltip - the desktop grid passes the event's notes so the
  // full text is reachable even when the title truncates inside a cell.
  tooltip?: string
  // Compact variant for the dense mobile month grid: smaller text, tighter
  // padding, no icon (the ~50px columns are too narrow to fit one without
  // crowding the title).
  compact?: boolean
}

// Renders a single calendar event inside a day cell. Two looks:
//   - Birthdays (cake icon): a standalone big Apple cake with the name beneath
//     it and no highlighter pill - the way the cake simply sits in the day box
//     on the hand-made paper calendars.
//   - Everything else: the "highlighter swipe" chip - bold category-colored
//     text on a saturated marker tint.
// Shared by the desktop grid (and therefore the PNG export) and the mobile grid
// so the look stays identical everywhere and the export matches the live page.
export default function EventChip({ title, icon, color, tooltip, compact = false }: EventChipProps) {
  const colors = COLOR_MAP[color] ?? COLOR_MAP.slate
  const isBirthday = icon === 'cake'

  if (compact) {
    return (
      <div
        className="mx-0.5 rounded-[3px] px-1 py-[1px] text-center font-display text-[10px] font-bold leading-tight truncate"
        style={{ backgroundColor: colors.highlight, color: colors.text }}
      >
        {title}
      </div>
    )
  }

  // Birthday: standalone cake marker, name underneath, no pill.
  if (isBirthday) {
    return (
      <div
        title={tooltip ?? title}
        className="flex flex-col items-center justify-center gap-0.5 py-0.5 leading-none"
      >
        <CakeMarker size={36} />
        <span
          className="max-w-full break-words text-center font-display text-[10px] font-bold leading-tight"
          style={{ color: colors.text }}
        >
          {title}
        </span>
      </div>
    )
  }

  // Every other category: the highlighter-swipe chip.
  return (
    <div
      title={tooltip ?? title}
      className="flex items-center justify-center gap-1 min-w-0 rounded-[4px] px-1.5 py-[3px] font-display text-[11px] font-bold leading-tight"
      style={{ backgroundColor: colors.highlight, color: colors.text }}
    >
      <CalendarIcon iconKey={icon} size={10} color={colors.text} />
      <span className="truncate">{title}</span>
    </div>
  )
}

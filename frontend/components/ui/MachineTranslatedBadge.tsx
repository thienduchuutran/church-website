import { useTranslations } from 'next-intl'

// MachineTranslatedBadge renders the small "Bản dịch tự động" notice next to
// content that was served from an unapproved AI translation. Design tokens
// come straight from the Phase 4 spec:
//
//   - terracotta (#C4663C) text       ← brand primary, matches "Auto-translated" warmth
//   - 10px font size, italic           ← low visual weight: informative, not alarming
//   - bottom-of-card position          ← caller decides exact placement
//
// The text is keyed by the Common.machineTranslated message so the same badge
// works for any future non-English locale - just add a translation key and the
// badge picks it up.
//
// Callers should guard the render with the content's machine_translated flag:
//   {post.machine_translated && <MachineTranslatedBadge />}
// Rendering unconditionally would be a UX regression on English views and on
// human-approved translations.
export default function MachineTranslatedBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('Common')
  return (
    <span
      className={`text-[10px] italic ${className}`}
      style={{ color: '#C4663C' }}
      role="note"
      aria-label={t('machineTranslated')}
    >
      {t('machineTranslated')}
    </span>
  )
}

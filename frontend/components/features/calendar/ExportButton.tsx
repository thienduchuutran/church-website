'use client'

import { useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Snapshot the calendar wrapper to a PNG and trigger a download. Reused by
// both the inline ExportButton and the FAB action sheet, so kept as a free
// function rather than coupled to a specific component.
export async function exportCalendarToPng(
  root: HTMLDivElement,
  year: number,
  month: number,
) {
  // Strip the "today" circle highlight - save className + style to restore later
  const todayCircles = Array.from(root.querySelectorAll<HTMLElement>('[data-today-circle]'))
  const savedCircles = todayCircles.map(el => ({
    el,
    className: el.className,
    style: el.getAttribute('style') ?? '',
  }))
  todayCircles.forEach(el => {
    el.className = 'absolute top-1.5 right-1.5 z-10 font-sans text-xs font-semibold leading-none text-gray-600'
    el.removeAttribute('style')
  })

  // Force the export canvas to 1100px - the live page is fluid (so mobile
  // visitors don't get a 1100px-wide horizontal-scroll mess), but the PNG
  // export must always match the printed-calendar aspect ratio. Note: the
  // grid/agenda swap inside is still viewport-driven, so an admin who
  // exports from a phone-sized viewport (<768px) will get the agenda PNG.
  const savedRootStyle = root.getAttribute('style') ?? ''
  root.style.width = '1100px'
  root.style.maxWidth = 'none'

  try {
    const { toPng } = await import('html-to-image')
    const url = await toPng(root, {
      pixelRatio: 2,
      cacheBust: true,
      filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-export-hide')),
    })
    const link = document.createElement('a')
    link.download = `calendar-${MONTH_NAMES[month - 1]}-${year}.png`
    link.href = url
    link.click()
  } finally {
    if (savedRootStyle) root.setAttribute('style', savedRootStyle)
    else root.removeAttribute('style')
    savedCircles.forEach(({ el, className, style }) => {
      el.className = className
      if (style) el.setAttribute('style', style)
      else el.removeAttribute('style')
    })
  }
}

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>
  year: number
  month: number
  isAdmin: boolean
}

export default function ExportButton({ targetRef, year, month, isAdmin }: ExportButtonProps) {
  if (!isAdmin) return null
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (!targetRef.current) return
    setExporting(true)
    try {
      await exportCalendarToPng(targetRef.current, year, month)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-display text-sm font-medium border border-border text-muted hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
    >
      <DownloadSimple size={15} weight="bold" />
      {exporting ? 'Exporting…' : 'Export for Discord'}
    </button>
  )
}

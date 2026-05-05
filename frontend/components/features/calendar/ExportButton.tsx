'use client'

import { useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

    const root = targetRef.current

    // Strip the "today" circle highlight - save className + style to restore later
    const todayCircles = Array.from(root.querySelectorAll<HTMLElement>('[data-today-circle]'))
    const savedCircles = todayCircles.map(el => ({
      el,
      className: el.className,
      style: el.getAttribute('style') ?? '',
    }))
    todayCircles.forEach(el => {
      el.className = 'font-sans text-xs font-semibold self-end leading-none mb-0.5 text-gray-600'
      el.removeAttribute('style')
    })

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
      savedCircles.forEach(({ el, className, style }) => {
        el.className = className
        if (style) el.setAttribute('style', style)
        else el.removeAttribute('style')
      })
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

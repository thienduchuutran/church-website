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
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(targetRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `calendar-${MONTH_NAMES[month - 1]}-${year}.png`
      link.href = url
      link.click()
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
    >
      <DownloadSimple size={15} weight="bold" />
      {exporting ? 'Exporting…' : 'Export for Discord'}
    </button>
  )
}

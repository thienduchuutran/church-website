'use client'

import { useRef, useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLDivElement | null>
}

export default function ExportButton({ targetRef }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (!targetRef.current) return
    setExporting(true)
    try {
      // Dynamically import so html2canvas is not in the main bundle
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--background')
          .trim() || '#faf8f5',
        scale: 2,       // retina-quality export
        useCORS: true,
        logging: false,
      })
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      const now = new Date()
      const monthName = now.toLocaleString('default', { month: 'long' }).toLowerCase()
      link.download = `church-calendar-${monthName}-${now.getFullYear()}.png`
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

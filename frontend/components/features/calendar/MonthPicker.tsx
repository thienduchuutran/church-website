'use client'

import { useEffect, useRef, useState } from 'react'

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface MonthPickerProps {
  year: number          // currently selected year (drives initial browse + highlight)
  month: number         // currently selected month (1–12)
  themeColor: string    // accent for selected/today markers
  onSelect: (year: number, month: number) => void
  onClose: () => void
}

export default function MonthPicker({
  year,
  month,
  themeColor,
  onSelect,
  onClose,
}: MonthPickerProps) {
  // Browse year is independent from selected year - user can flip ahead
  // through years to scan, then click a month to commit the change.
  const [browseYear, setBrowseYear] = useState(year)
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1

  useEffect(() => {
    setShown(true)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }

    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Jump to month"
      className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 z-30 w-[280px] max-w-[calc(100vw-2rem)] bg-white border-2 border-gray-900 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)] origin-top transition-all duration-150 ${
        shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
    >
      {/* Year nav */}
      <div
        className="flex items-center justify-between px-2 py-2 border-b-2 border-gray-900"
        style={{ backgroundColor: '#FAF7F2' }}
      >
        <button
          onClick={() => setBrowseYear((y) => y - 1)}
          aria-label="Previous year"
          className="px-3 py-1 font-display text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
        >
          ←
        </button>
        <span
          className="text-base font-bold tracking-wide text-gray-900"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {browseYear}
        </span>
        <button
          onClick={() => setBrowseYear((y) => y + 1)}
          aria-label="Next year"
          className="px-3 py-1 font-display text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
        >
          →
        </button>
      </div>

      {/* Month grid: 3 × 4 */}
      <div className="grid grid-cols-3 gap-1 p-2">
        {MONTH_LABELS.map((label, i) => {
          const m = i + 1
          const isSelected = browseYear === year && m === month
          const isToday = browseYear === todayYear && m === todayMonth
          return (
            <button
              key={m}
              onClick={() => onSelect(browseYear, m)}
              aria-current={isSelected ? 'true' : undefined}
              className={`relative px-3 py-3 font-display text-[11px] font-bold uppercase tracking-[0.1em] transition-all rounded-sm ${
                isSelected
                  ? 'text-white'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
              style={isSelected ? { backgroundColor: themeColor } : {}}
            >
              {label}
              {isToday && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: themeColor }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

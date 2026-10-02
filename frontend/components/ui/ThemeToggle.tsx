'use client'

import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { Desktop, Sun, Moon } from '@phosphor-icons/react'

const ORDER = ['system', 'light', 'dark'] as const
type ThemeChoice = (typeof ORDER)[number]

const ICON: Record<ThemeChoice, typeof Desktop> = {
  system: Desktop,
  light: Sun,
  dark: Moon,
}

// A single cycling button rather than LanguageSwitcher's segmented pill: that
// pattern fits exactly 2 options that should both stay visible at once, but
// this is 3 states with a decided cycle interaction (system -> light -> dark).
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const t = useTranslations('Theme')

  // `theme` is undefined on the server and until next-themes resolves the
  // stored choice client-side, so this already renders the "system" icon
  // until then without needing a separate mounted flag.
  const current = (theme as ThemeChoice) ?? 'system'
  const Icon = ICON[current]

  function cycle() {
    setTheme(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length])
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={t('current', { mode: t(current) })}
      title={t(current)}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface/80 text-foreground transition-colors hover:bg-primary/10 hover:text-primary ${className}`}
    >
      <Icon size={18} weight="bold" aria-hidden />
    </button>
  )
}

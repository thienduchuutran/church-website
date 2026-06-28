'use client'

import {
  Cake,
  BookOpen,
  Bell,
  Heart,
  Star,
  Users,
  MusicNotes,
  Cross,
  Flame,
  Sparkle,
  GraduationCap,
} from '@phosphor-icons/react'

const ICON_MAP: Record<string, React.ElementType> = {
  'cake':        Cake,
  'book-open':   BookOpen,
  'bell':        Bell,
  'heart':       Heart,
  'star':        Star,
  'users':       Users,
  'music-notes': MusicNotes,
  'cross':       Cross,
  'flame':       Flame,
  'sparkle':     Sparkle,
  'graduation-cap': GraduationCap,
}

interface CalendarIconProps {
  iconKey: string
  size?: number
  color?: string
}

export default function CalendarIcon({ iconKey, size = 14, color }: CalendarIconProps) {
  const Icon = ICON_MAP[iconKey] ?? Star
  return <Icon size={size} color={color} weight="bold" />
}

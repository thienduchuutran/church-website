import type { ReactNode } from 'react'
import { Link } from '@/i18n/routing'

// SectionHeader is the one dominant element every section gets: the heading
// on a lavender ribbon that runs off the column's left edge and rounds on the
// right, like a section band in a hand-made bulletin, plus an optional
// "View all" link. The heading is in the active language only - the site
// never mixes languages on one page; the switcher in the nav is how a reader
// changes it.
//
// `level: 'page'` renders an h1 in the page-title role, without the ribbon.
interface SectionHeaderProps {
  id: string
  title: ReactNode
  href?: string
  linkLabel?: ReactNode
  level?: 'section' | 'page'
  className?: string
}

export default function SectionHeader({
  id,
  title,
  href,
  linkLabel,
  level = 'section',
  className = '',
}: SectionHeaderProps) {
  if (level === 'page') {
    return (
      <div className={`mb-8 flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 ${className}`}>
        <h1 id={id} className="t-title">
          {title}
        </h1>
        {href && linkLabel && <ViewAll href={href}>{linkLabel}</ViewAll>}
      </div>
    )
  }
  return (
    <div className={`mb-6 flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 ${className}`}>
      <h2 id={id} className="t-section section-ribbon">
        {title}
      </h2>
      {href && linkLabel && <ViewAll href={href}>{linkLabel}</ViewAll>}
    </div>
  )
}

function ViewAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-sans text-sm font-bold text-primary transition-colors hover:bg-primary/10"
    >
      {children}
      <span aria-hidden className="ml-1">
        →
      </span>
    </Link>
  )
}

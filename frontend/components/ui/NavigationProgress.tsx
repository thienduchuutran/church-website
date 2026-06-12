'use client'

import { usePathname } from '@/i18n/routing'
import { useEffect, useRef, useState } from 'react'

// Shows a thin progress bar at the top of the page immediately on link click,
// before the server responds. Disappears when the new route commits.
export default function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const prevPathname = useRef(pathname)

  // Hide bar as soon as the new route is committed.
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      setVisible(false)
    }
  }, [pathname])

  // Show bar the moment any same-origin link is clicked.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/') || href === pathname) return
      setVisible(true)
    }

    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed left-0 right-0 top-0 z-[9999] h-[2px] overflow-hidden bg-primary/20">
      <div className="animate-nav-progress h-full w-full origin-left bg-primary" />
    </div>
  )
}

"use client"

import { usePathname } from "next/navigation"

// Uses key={pathname} to force React to remount this wrapper on every route
// change, which replays the CSS fade-in animation for a consistent page entry.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-page-fade-in">
      {children}
    </div>
  )
}

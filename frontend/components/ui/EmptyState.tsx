import type { ReactNode } from 'react'

// EmptyState is the shared "nothing here yet" surface. It is a lavender
// panel with a bold ink line and an optional muted hint - deliberately not
// a dashed box, which reads as "broken", and not a card, which reads as
// "content". A tinted panel reads as "waiting", which is the truth.
interface EmptyStateProps {
  title: ReactNode
  hint?: ReactNode
  className?: string
}

export default function EmptyState({ title, hint, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-[14px] bg-panel px-6 py-6 ${className}`}>
      <p className="t-card">{title}</p>
      {hint && <p className="t-body mt-1 text-[0.95rem] text-muted">{hint}</p>}
    </div>
  )
}

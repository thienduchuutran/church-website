import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Resources — Our Church',
}

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Resources</h1>
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-12 text-center">
        <p className="text-lg text-muted">Bible study materials and playlists coming soon.</p>
      </div>
    </div>
  )
}

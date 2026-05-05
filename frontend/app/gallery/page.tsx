import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gallery — Our Church',
}

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 font-serif text-3xl font-bold text-foreground">Gallery</h1>
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-12 text-center">
        <p className="font-sans text-lg text-muted">Photo albums coming soon.</p>
      </div>
    </div>
  )
}

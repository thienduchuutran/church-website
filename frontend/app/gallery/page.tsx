import type { Metadata } from 'next'
import GalleryContent from '@/components/features/gallery/GalleryContent'

export const metadata: Metadata = {
  title: 'Gallery - Our Church',
}

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <GalleryContent />
    </div>
  )
}

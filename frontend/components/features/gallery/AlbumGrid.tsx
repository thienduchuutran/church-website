'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Post } from '@/lib/types'
import AlbumViewer from './AlbumViewer'
import EmptyState from '@/components/ui/EmptyState'

export interface AlbumGridProps {
  albums: Post[]
  isLoading?: boolean
}

function formatDate(dateString: string, locale: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' })
}

export default function AlbumGrid({ albums, isLoading }: AlbumGridProps) {
  const [selectedAlbum, setSelectedAlbum] = useState<Post | null>(null)
  const t = useTranslations('Pages')
  const locale = useLocale()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square bg-panel rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (albums.length === 0) {
    return <EmptyState title={t('galleryEmpty')} hint={t('galleryEmptyHint')} />
  }

  return (
    <>
      {/* Album grid */}
      <div className="stagger-children grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {albums.map(album => {
          const coverImage = album.images?.[0]
          const photoCount = album.images?.length || 0

          return (
            <button
              key={album.id}
              type="button"
              onClick={() => setSelectedAlbum(album)}
              className="card-lift group relative aspect-square overflow-hidden rounded-lg bg-panel focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {/* Cover image */}
              {coverImage?.storage_url && (
                <img
                  src={coverImage.storage_url}
                  alt={album.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                />
              )}

              {/* Overlay with title and photo count. Plum scrim, so the
                  darkening belongs to the palette rather than neutral black. */}
              <div className="absolute inset-0 bg-gradient-to-t from-hero-bg/70 to-transparent flex flex-col justify-end p-3 sm:p-4">
                <h3 className="font-heading text-sm sm:text-base font-semibold text-white mb-1 line-clamp-2">
                  {album.title}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs sm:text-sm text-white/80">
                    {t('photoCount', { count: photoCount })}
                  </span>
                  {album.created_at && (
                    <span className="font-sans text-xs text-white/60">
                      {formatDate(album.created_at, locale)}
                    </span>
                  )}
                </div>
              </div>

              {/* Hover effect indicator */}
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors" />
            </button>
          )
        })}
      </div>

      {/* Album viewer modal */}
      {selectedAlbum && (
        <AlbumViewer album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}
    </>
  )
}

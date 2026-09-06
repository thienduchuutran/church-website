'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { listPosts } from '@/lib/posts'
import type { Post } from '@/lib/types'
import TagFilterChips from './TagFilterChips'
import AlbumGrid from './AlbumGrid'

export default function GalleryContent() {
  const locale = useLocale()
  const t = useTranslations('Pages')
  const [albums, setAlbums] = useState<Post[]>([])
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlbums() {
      try {
        setLoading(true)
        const data = await listPosts({
          type: 'gallery_album',
          limit: 100,
          tags: selectedTagId ? [selectedTagId] : undefined,
          locale,
        })

        setAlbums(data)
      } catch (err) {
        console.error('Failed to load albums:', err)
        setAlbums([])
      } finally {
        setLoading(false)
      }
    }

    fetchAlbums()
  }, [selectedTagId, locale])

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <h1 className="t-title">{t('galleryTitle')}</h1>
        <p className="t-body mt-3 text-lg text-muted">{t('gallerySubtitle')}</p>
      </div>

      {/* Tag filter chips */}
      <div className="mb-8">
        <TagFilterChips
          selectedTagId={selectedTagId}
          onTagSelect={setSelectedTagId}
        />
      </div>

      {/* Album grid */}
      <AlbumGrid albums={albums} isLoading={loading} />
    </>
  )
}

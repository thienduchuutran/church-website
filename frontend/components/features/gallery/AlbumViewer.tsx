'use client'

import { useEffect, useRef } from 'react'
import type { Post } from '@/lib/types'

export interface AlbumViewerProps {
  album: Post
  onClose: () => void
}

export default function AlbumViewer({ album, onClose }: AlbumViewerProps) {
  const pswpRef = useRef<any>(null)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.css'
    document.head.appendChild(link)

    return () => {
      try {
        document.head.removeChild(link)
      } catch {
        // already removed
      }
    }
  }, [])

  useEffect(() => {
    const images = album.images || []
    if (images.length === 0) {
      onClose()
      return
    }

    let cancelled = false

    import('photoswipe').then(({ default: PhotoSwipe }) => {
      // Bail if the component unmounted (or re-ran under StrictMode) before
      // the dynamic import resolved. Without this, the modal pops up after
      // the user has already navigated away.
      if (cancelled) return

      try {
        const dataSource = images.map(img => ({
          src: img.storage_url,
          width: 1600,
          height: 1200,
          alt: album.title,
        }))

        const pswp = new PhotoSwipe({
          dataSource,
          index: 0,
          loop: true,
          pinchToClose: true,
          closeOnVerticalDrag: true,
          wheelToZoom: true,
          showHideAnimationType: 'fade',
          bgOpacity: 0.95,
          initialZoomLevel: 'fit',
          secondaryZoomLevel: 1.5,
          maxZoomLevel: 3,
        })

        pswp.on('destroy', onClose)
        pswp.init()
        pswpRef.current = pswp
      } catch (err) {
        console.error('PhotoSwipe initialization failed:', err)
        onClose()
      }
    }).catch(err => {
      if (cancelled) return
      console.error('Failed to load PhotoSwipe:', err)
      onClose()
    })

    return () => {
      cancelled = true
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy()
        } catch {
          // already destroyed
        }
        pswpRef.current = null
      }
    }
  }, [album.id])

  return null
}

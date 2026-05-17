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

    const run = async () => {
      // Probe each photo's real pixel dimensions before opening PhotoSwipe.
      // Why: PhotoSwipe uses (width, height) to size the slide and drive zoom
      // math. Previously we hardcoded 1600x1200, so portrait and non-4:3
      // landscape photos got stretched into the wrong box. Browsers cache
      // these loads, so PhotoSwipe reuses them when it renders each slide.
      const dataSource = await Promise.all(
        images.map(
          img =>
            new Promise<{ src: string; width: number; height: number; alt: string }>(resolve => {
              const probe = new window.Image()
              probe.onload = () =>
                resolve({
                  src: img.storage_url,
                  width: probe.naturalWidth || 1600,
                  height: probe.naturalHeight || 1200,
                  alt: album.title,
                })
              probe.onerror = () =>
                resolve({ src: img.storage_url, width: 1600, height: 1200, alt: album.title })
              probe.src = img.storage_url
            })
        )
      )

      if (cancelled) return

      const { default: PhotoSwipe } = await import('photoswipe')
      if (cancelled) return

      try {
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
          secondaryZoomLevel: 'fill',
          maxZoomLevel: 4,
          imageClickAction: 'zoom',
        })

        pswp.on('destroy', onClose)
        pswp.init()
        pswpRef.current = pswp
      } catch (err) {
        console.error('PhotoSwipe initialization failed:', err)
        onClose()
      }
    }

    run().catch(err => {
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

'use client'

import { useEffect, useRef } from 'react'
import type { Post, PostImage } from '@/lib/types'

export interface AlbumViewerProps {
  album: Post
  onClose: () => void
}

export default function AlbumViewer({ album, onClose }: AlbumViewerProps) {
  const pswpRef = useRef<any>(null)

  useEffect(() => {
    // Load PhotoSwipe CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.css'
    document.head.appendChild(link)

    return () => {
      try {
        document.head.removeChild(link)
      } catch {
        // Already removed
      }
    }
  }, [])

  useEffect(() => {
    const images = album.images || []
    if (images.length === 0) {
      onClose()
      return
    }

    // Dynamically import PhotoSwipe to handle SSR
    import('photoswipe').then(({ default: PhotoSwipe }) => {
      try {
        // Build PhotoSwipe items from album images
        const items = images.map((img: PostImage) => ({
          src: img.storage_url,
          thumb: img.storage_url,
          w: 1200,
          h: 800,
          title: `Photo ${images.indexOf(img) + 1}`,
        }))

        // Create PhotoSwipe instance with explicit root element
        const pswp = new PhotoSwipe({
          items,
          options: {
            index: 0,
            loop: true,
            pinchToClose: true,
            closeOnVerticalDrag: true,
            wheelToZoom: true,
            showHideAnimationType: 'fade',
            maxSpreadZoom: 3,
            initialZoomLevel: 'fit',
          },
        })

        pswp.on('destroy', onClose)
        pswp.init()
        pswpRef.current = pswp
      } catch (err) {
        console.error('PhotoSwipe initialization failed:', err)
        onClose()
      }
    }).catch(err => {
      console.error('Failed to load PhotoSwipe:', err)
      onClose()
    })

    return () => {
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy()
        } catch {
          // Already destroyed
        }
        pswpRef.current = null
      }
    }
  }, [album.id, album.images, onClose])

  return null
}

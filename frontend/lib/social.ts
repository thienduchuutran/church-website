export type SocialPlatform = 'youtube' | 'facebook' | 'instagram'

export interface SocialLink {
  platform: SocialPlatform
  url: string
  label: string
  brandColor: string
}

// Order is strategic, not alphabetical: YouTube ranks first because sermons are
// the highest-value content asset we want visitors to follow; Facebook second
// because the Vietnamese diaspora community engages most heavily there;
// Instagram third as the youth/visual storytelling bridge.
export const SOCIAL_LINKS: SocialLink[] = [
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/@vgomne',
    label: 'Follow VGOMNE on YouTube',
    brandColor: '#FF0000',
  },
  {
    platform: 'facebook',
    url: 'https://www.facebook.com/vgom101',
    label: 'Follow VGOMNE on Facebook',
    brandColor: '#1877F2',
  },
  {
    platform: 'instagram',
    url: 'https://www.instagram.com/vacsaugus/',
    label: 'Follow VGOMNE on Instagram',
    brandColor: '#E4405F',
  },
]

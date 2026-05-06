import { apiGet, apiPatch, apiPostMultipart } from './api'
import type { HeroVideo } from './types'

const HERO_VIDEO_PATH = '/api/v1/hero-video'
const ADMIN_HERO_VIDEO_PATH = '/api/v1/admin/hero-video'

// getHeroVideo fetches the currently active background video for the homepage.
// Returns null if no video has been uploaded yet (valid initial state).
export async function getHeroVideo(): Promise<HeroVideo | null> {
  return (await apiGet(HERO_VIDEO_PATH)) as HeroVideo | null
}

// uploadHeroVideo sends the file as multipart/form-data under the "video" field,
// which is what the Go handler expects (r.FormFile("video")).
export async function uploadHeroVideo(file: File, token: string): Promise<HeroVideo> {
  const form = new FormData()
  form.append('video', file)
  return (await apiPostMultipart(ADMIN_HERO_VIDEO_PATH, form, token)) as HeroVideo
}

// setHeroVideoVisibility toggles whether the active hero video is shown on the homepage.
export async function setHeroVideoVisibility(visible: boolean, token: string): Promise<void> {
  await apiPatch(ADMIN_HERO_VIDEO_PATH + '/visibility', { is_visible: visible }, token)
}

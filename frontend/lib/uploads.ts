import { apiPostMultipart } from './api'

export interface EditorImageUploadResponse {
  url: string
}

// uploadEditorImage sends an image dropped into the post-body editor to R2 and
// returns its permanent public URL, which the editor embeds as an <img>. Admin
// token required. Distinct from lib/posts.ts uploadImage (gallery), which binds
// an image to an existing post and returns an object key, not a URL.
export async function uploadEditorImage(file: File, token: string): Promise<EditorImageUploadResponse> {
  const formData = new FormData()
  formData.append('image', file)
  return (await apiPostMultipart('/api/v1/uploads/image', formData, token)) as EditorImageUploadResponse
}

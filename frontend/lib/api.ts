const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json()
  }
}

export async function apiGet(path: string) {
  return handleResponse(await fetch(`${API_URL}${path}`))
}

export async function apiPost(path: string, body: unknown, accessToken: string) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
  )
}

export async function apiPatch(path: string, body: unknown, accessToken: string) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
  )
}

export async function apiDelete(path: string, accessToken: string) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  )
}

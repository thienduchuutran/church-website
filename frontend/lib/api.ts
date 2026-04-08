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
  // no-store ensures the browser (and any intermediate cache) always hits the
  // network — needed for endpoints like /reactions whose response changes
  // whenever the user reacts on another page but the URL stays identical.
  return handleResponse(await fetch(`${API_URL}${path}`, { cache: 'no-store' }))
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

// apiPostAnon sends a POST without an auth token — for public endpoints like reactions.
export async function apiPostAnon(path: string, body: unknown) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// apiDeleteAnon sends a DELETE without an auth token, with an optional JSON body.
export async function apiDeleteAnon(path: string, body?: unknown) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  )
}

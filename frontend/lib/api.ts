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

export async function apiGet(path: string, accessToken?: string | null) {
  // no-store ensures the browser (and any intermediate cache) always hits the
  // network - needed for endpoints like /reactions whose response changes
  // whenever the user reacts on another page but the URL stays identical.
  // accessToken is optional - when present it's forwarded as Bearer so
  // auth-aware endpoints (e.g. GET /calendar with OptionalAdmin) can return
  // privileged fields like private_address that are stripped for public requests.
  const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  return handleResponse(await fetch(`${API_URL}${path}`, { cache: 'no-store', headers }))
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

export async function apiPut(path: string, body: unknown, accessToken: string) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'PUT',
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

// apiPostAnon sends a POST without an auth token - for public endpoints like reactions.
export async function apiPostAnon(path: string, body: unknown) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// apiPostMultipart sends a POST with a FormData body (file upload).
// Content-Type is intentionally omitted so the browser sets the multipart
// boundary automatically - setting it manually breaks the boundary string.
export async function apiPostMultipart(path: string, formData: FormData, accessToken: string) {
  return handleResponse(
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
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

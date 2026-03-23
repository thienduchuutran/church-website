# docs/agents/auth.md — Authentication Reference

## Overview
Authentication is handled entirely by Supabase Auth using Google OAuth.
Authorization (is this person an admin?) is handled by the `admins` table in our database.

**Auth = who you are. Authorization = what you're allowed to do.**

---

## Flow: how login works end-to-end

```
1. Visitor clicks "Admin Login" on the frontend
2. Frontend calls supabase.auth.signInWithOAuth({ provider: 'google' })
3. User is redirected to Google's consent screen
4. Google redirects back to Supabase callback URL
5. Supabase creates/updates a row in auth.users, issues a JWT
6. Frontend receives the JWT session (stored automatically by Supabase client)
7. Frontend fetches /admin page
8. Admin page calls supabase.auth.getSession() to get the JWT
9. Frontend checks: does this email exist in the admins table?
   - No → redirect to homepage (not an admin)
   - Yes → show admin panel
10. For any write operation, frontend sends JWT in Authorization header to Go backend
11. Go backend's auth middleware verifies the JWT and checks admins table
12. If valid admin → request proceeds. If not → 401/403 response.
```

---

## Frontend: Supabase Auth setup

```js
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

```js
// Trigger Google login
await supabase.auth.signInWithOAuth({ provider: 'google' })

// Get current session (call this to check if logged in)
const { data: { session } } = await supabase.auth.getSession()

// Logout
await supabase.auth.signOut()
```

---

## Frontend: admin check pattern

```js
// In /admin/page.jsx
const { data: { session } } = await supabase.auth.getSession()

if (!session) {
  redirect('/')  // not logged in
}

// Check if this Google user is in the admins whitelist
const { data: adminRow } = await supabase
  .from('admins')
  .select('id')
  .eq('email', session.user.email)
  .single()

if (!adminRow) {
  redirect('/')  // logged in with Google but not an admin
}

// If we reach here, they are a valid admin
```

---

## Backend: JWT verification middleware (`internal/middleware/auth.go`)

The Go backend receives the Supabase JWT in the `Authorization: Bearer <token>` header.
It verifies the JWT using the Supabase JWT secret (not by calling Supabase's API — this is done locally and is fast).
Then it checks the email from the JWT payload exists in the `admins` table.

```go
// Pseudocode — see actual implementation in internal/middleware/auth.go
func RequireAdmin(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := extractBearerToken(r)
        claims := verifyJWT(token, os.Getenv("SUPABASE_JWT_SECRET"))
        email := claims["email"].(string)

        exists := repo.AdminExists(email)  // query admins table
        if !exists {
            http.Error(w, `{"error": "forbidden"}`, http.StatusForbidden)
            return
        }

        // Attach email to context for use in handlers
        ctx := context.WithValue(r.Context(), "admin_email", email)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

---

## JWT secret location
`SUPABASE_JWT_SECRET` lives in `backend/.env`.
Find it in: Supabase dashboard → Project Settings → API → JWT Secret.
This secret must never be in the frontend or in any public file.

---

## Adding a new admin
1. Go to Supabase dashboard → Table Editor → `admins`
2. Insert a new row with the person's Google account email address
3. That's it — no code change needed

## Removing an admin
1. Delete their row from the `admins` table in Supabase dashboard
2. Their existing JWT will still be valid until it expires (~1 hour), then they lose access automatically

---

## Important notes
- Supabase JWTs expire after 1 hour by default. The Supabase client auto-refreshes them silently.
- The `anon` key in the frontend is safe to expose — Supabase RLS policies enforce what the anon key can and cannot do.
- The `service_role` key must only ever be in `backend/.env`. It bypasses RLS entirely.

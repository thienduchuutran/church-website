package handler

import "net/http"

// Me handles GET /api/v1/auth/me.
// The route sits inside the RequireAdmin middleware group, so reaching this
// handler already means the JWT is valid and the email is in the admins table.
// The frontend uses this to decide whether to show admin controls, avoiding
// a direct Supabase DB query that would break once DATABASE_URL points to RDS.
func Me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"is_admin": true})
}

// Conversions between the two date formats the app deals with:
//   - ISO string (UTC, with timezone) — what the backend stores in
//     event_date and what JSON returns from /api/v1/posts.
//   - datetime-local string (`YYYY-MM-DDTHH:mm`, no timezone) — what
//     <input type="datetime-local"> reads and writes in the user's
//     local zone.
// Browsers do the timezone math automatically when constructing/reading
// `new Date(...)`; these helpers only handle the formatting.

export function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString()
}

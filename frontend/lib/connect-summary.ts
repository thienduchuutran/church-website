import { getPageContent } from './pages'

// The Connect page is the single source of truth for "when and where":
// service time and street address live in its admin-edited sections. The
// homepage hero and the site footer both print a one-line summary of them,
// and this helper is what keeps the three surfaces agreeing.
//
// Until an admin fills the Connect page in, its sections carry "TODO: ..."
// placeholders (see app/[locale]/connect/page.tsx). Those are fine on the
// Connect page itself, where an admin will see and replace them, but they
// must never leak into the hero or the footer - so a placeholder counts as
// "not set" here and the callers simply omit the line.
export interface ConnectSummary {
  // e.g. "Sundays 10:00 AM" - null until both day and time are real
  serviceLine: string | null
  // e.g. "101 Main St, Saugus, MA 01906" - null until the street is real
  addressLine: string | null
}

const EMPTY: ConnectSummary = { serviceLine: null, addressLine: null }

function isReal(value: string | undefined): value is string {
  if (!value) return false
  const v = value.trim()
  return v !== '' && !/^TODO\b/i.test(v)
}

export async function getConnectSummary(locale: string): Promise<ConnectSummary> {
  try {
    const { sections: s } = await getPageContent('connect', locale)
    const serviceLine =
      isReal(s.service_time_1_day) && isReal(s.service_time_1_time)
        ? `${s.service_time_1_day.trim()} ${s.service_time_1_time.trim()}`
        : null
    const addressLine = isReal(s.location_address)
      ? [s.location_address.trim(), isReal(s.location_city_state_zip) ? s.location_city_state_zip.trim() : null]
          .filter(Boolean)
          .join(', ')
      : null
    return { serviceLine, addressLine }
  } catch {
    // A dead backend must not take the hero or the footer down with it.
    return EMPTY
  }
}

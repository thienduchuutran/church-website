import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { getPageContent } from '@/lib/pages'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'

export const metadata: Metadata = {
  title: 'Connect - Our Church',
}

export const revalidate = 60

// Default placeholder values used when the backend has no content yet.
// lib/connect-summary.ts treats any "TODO..." value as "not set", which is
// what keeps these placeholders off the homepage hero and the footer.
const defaults: Record<string, string> = {
  hero_title: 'Connect With Us',
  hero_subtitle: 'TODO: a warm one-liner inviting visitors to reach out or visit',
  service_times_heading: 'Service Times',
  service_time_1_day: 'TODO: day (e.g. Sunday)',
  service_time_1_time: 'TODO: time (e.g. 10:00 AM)',
  service_time_1_label: 'TODO: label (e.g. Worship Service)',
  service_time_2_day: 'TODO: day',
  service_time_2_time: 'TODO: time',
  service_time_2_label: 'TODO: label',
  location_heading: 'Where to Find Us',
  location_address: 'TODO: street address',
  location_city_state_zip: 'TODO: city, state, zip',
  location_directions_note: 'TODO: optional parking / directions note',
  contact_heading: 'Get in Touch',
  contact_email: 'TODO: contact email (e.g. hello@yourchurch.org)',
  contact_phone: 'TODO: phone number',
  contact_note: 'TODO: a short note about response times or who will reply',
  plan_a_visit_heading: 'Plan a Visit',
  plan_a_visit_body:
    'TODO: a short paragraph telling first-time visitors what to expect - dress code, kids programs, where to park, how long the service runs.',
}

async function loadSections(locale: string): Promise<{ sections: Record<string, string>; machineTranslated: boolean }> {
  try {
    const data = await getPageContent('connect', locale)
    return {
      sections: { ...defaults, ...data.sections },
      machineTranslated: data.machine_translated ?? false,
    }
  } catch {
    return { sections: defaults, machineTranslated: false }
  }
}

// One flat section shape for the whole page: magenta heading, brand rule,
// content on the field. No card wrappers - the page is prose, not widgets.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="t-section">{title}</h2>
      <div aria-hidden className="brand-rule mb-5 mt-3" />
      {children}
    </section>
  )
}

export default async function ConnectPage() {
  const locale = await getLocale()
  const { sections: s, machineTranslated } = await loadSections(locale)

  const serviceTimes = [
    { day: s.service_time_1_day, time: s.service_time_1_time, label: s.service_time_1_label },
    { day: s.service_time_2_day, time: s.service_time_2_time, label: s.service_time_2_label },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      {/* Hero */}
      <header className="mb-14">
        <h1 className="t-title">{s.hero_title}</h1>
        <p className="t-body mt-4 max-w-[60ch] text-lg text-muted">{s.hero_subtitle}</p>
        {machineTranslated && (
          <div className="mt-3">
            <MachineTranslatedBadge />
          </div>
        )}
      </header>

      {/* Service Times */}
      <Section title={s.service_times_heading}>
        <ul className="divide-y divide-border">
          {serviceTimes.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <div>
                <p className="t-card text-[1.1rem]">{item.day}</p>
                <p className="t-meta mt-0.5">{item.label}</p>
              </div>
              <p className="font-heading text-lg font-bold text-primary">{item.time}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Location */}
      <Section title={s.location_heading}>
        <p className="t-body">{s.location_address}</p>
        <p className="t-body">{s.location_city_state_zip}</p>
        <p className="t-body mt-3 text-[0.95rem] text-muted">{s.location_directions_note}</p>
      </Section>

      {/* Contact */}
      <Section title={s.contact_heading}>
        <dl className="space-y-2">
          <div className="flex items-baseline gap-4">
            <dt className="t-meta w-16 shrink-0">Email</dt>
            <dd className="t-body">{s.contact_email}</dd>
          </div>
          <div className="flex items-baseline gap-4">
            <dt className="t-meta w-16 shrink-0">Phone</dt>
            <dd className="t-body">{s.contact_phone}</dd>
          </div>
        </dl>
        <p className="t-body mt-4 text-[0.95rem] text-muted">{s.contact_note}</p>
      </Section>

      {/* Plan a Visit */}
      <Section title={s.plan_a_visit_heading}>
        <p className="t-body max-w-[65ch]">{s.plan_a_visit_body}</p>
      </Section>
    </div>
  )
}

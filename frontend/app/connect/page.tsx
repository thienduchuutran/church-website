import type { Metadata } from 'next'
import { apiGet } from '@/lib/api'

export const metadata: Metadata = {
  title: 'Connect — Our Church',
}

export const revalidate = 60

// Default placeholder values used when the backend has no content yet.
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
    'TODO: a short paragraph telling first-time visitors what to expect — dress code, kids programs, where to park, how long the service runs.',
}

async function getSections(): Promise<Record<string, string>> {
  try {
    const data = await apiGet('/api/v1/pages/connect')
    return { ...defaults, ...data?.sections }
  } catch {
    return defaults
  }
}

export default async function ConnectPage() {
  const s = await getSections()

  const serviceTimes = [
    { day: s.service_time_1_day, time: s.service_time_1_time, label: s.service_time_1_label },
    { day: s.service_time_2_day, time: s.service_time_2_time, label: s.service_time_2_label },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-12 text-center">
        <h1 className="mb-3 font-serif text-4xl font-bold tracking-tight text-foreground">
          {s.hero_title}
        </h1>
        <p className="font-sans text-lg text-muted">{s.hero_subtitle}</p>
      </header>

      {/* Service Times */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 font-serif text-2xl font-semibold text-foreground">
          {s.service_times_heading}
        </h2>
        <ul className="space-y-3">
          {serviceTimes.map((item, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-sans font-medium text-foreground">{item.day}</p>
                <p className="font-sans text-sm text-muted">{item.label}</p>
              </div>
              <p className="font-sans text-primary">{item.time}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Location */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-foreground">{s.location_heading}</h2>
        <p className="font-sans text-foreground">{s.location_address}</p>
        <p className="font-sans text-foreground">{s.location_city_state_zip}</p>
        <p className="mt-3 font-sans text-sm text-muted">{s.location_directions_note}</p>
      </section>

      {/* Contact */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 font-serif text-2xl font-semibold text-foreground">{s.contact_heading}</h2>
        <dl className="space-y-2">
          <div className="flex gap-3">
            <dt className="w-20 font-display text-sm font-medium text-muted">Email</dt>
            <dd className="font-sans text-foreground">{s.contact_email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 font-display text-sm font-medium text-muted">Phone</dt>
            <dd className="font-sans text-foreground">{s.contact_phone}</dd>
          </div>
        </dl>
        <p className="mt-4 font-sans text-sm text-muted">{s.contact_note}</p>
      </section>

      {/* Plan a Visit */}
      <section className="rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-foreground">
          {s.plan_a_visit_heading}
        </h2>
        <p className="font-sans leading-relaxed text-muted">{s.plan_a_visit_body}</p>
      </section>
    </div>
  )
}

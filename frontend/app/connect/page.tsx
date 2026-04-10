import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Connect — Our Church',
}

// ============================================================
// EDIT THIS BLOCK TO UPDATE THE CONNECT PAGE
// Church leaders / future editors: all the text on this page
// lives in the `content` object below. You do not need to touch
// anything else in this file. Replace each "TODO" string with
// real info when you are ready.
// ============================================================
const content = {
  hero: {
    title: 'Connect With Us',
    subtitle: 'TODO: a warm one-liner inviting visitors to reach out or visit',
  },
  serviceTimes: {
    heading: 'Service Times',
    items: [
      { day: 'TODO: day (e.g. Sunday)', time: 'TODO: time (e.g. 10:00 AM)', label: 'TODO: label (e.g. Worship Service)' },
      { day: 'TODO: day', time: 'TODO: time', label: 'TODO: label' },
    ],
  },
  location: {
    heading: 'Where to Find Us',
    address: 'TODO: street address',
    cityStateZip: 'TODO: city, state, zip',
    directionsNote: 'TODO: optional parking / directions note',
  },
  contact: {
    heading: 'Get in Touch',
    email: 'TODO: contact email (e.g. hello@yourchurch.org)',
    phone: 'TODO: phone number',
    note: 'TODO: a short note about response times or who will reply',
  },
  planAVisit: {
    heading: 'Plan a Visit',
    body: 'TODO: a short paragraph telling first-time visitors what to expect — dress code, kids programs, where to park, how long the service runs.',
  },
}
// ============================================================

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground">
          {content.hero.title}
        </h1>
        <p className="text-lg text-muted">{content.hero.subtitle}</p>
      </header>

      {/* Service Times */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">
          {content.serviceTimes.heading}
        </h2>
        <ul className="space-y-3">
          {content.serviceTimes.items.map((item, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium text-foreground">{item.day}</p>
                <p className="text-sm text-muted">{item.label}</p>
              </div>
              <p className="text-primary">{item.time}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Location */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 text-2xl font-semibold text-foreground">
          {content.location.heading}
        </h2>
        <p className="text-foreground">{content.location.address}</p>
        <p className="text-foreground">{content.location.cityStateZip}</p>
        <p className="mt-3 text-sm text-muted">{content.location.directionsNote}</p>
      </section>

      {/* Contact */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">
          {content.contact.heading}
        </h2>
        <dl className="space-y-2">
          <div className="flex gap-3">
            <dt className="w-20 text-sm font-medium text-muted">Email</dt>
            <dd className="text-foreground">{content.contact.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 text-sm font-medium text-muted">Phone</dt>
            <dd className="text-foreground">{content.contact.phone}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">{content.contact.note}</p>
      </section>

      {/* Plan a Visit */}
      <section className="rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 text-2xl font-semibold text-foreground">
          {content.planAVisit.heading}
        </h2>
        <p className="leading-relaxed text-muted">{content.planAVisit.body}</p>
      </section>
    </div>
  )
}

import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { getPageContent } from '@/lib/pages'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'

export const metadata: Metadata = {
  title: 'About - Our Church',
}

export const revalidate = 60

// Default placeholder values used when the backend has no content yet.
const defaults: Record<string, string> = {
  hero_title: 'About Our Church',
  hero_subtitle: 'TODO: one-line tagline that captures who you are',
  mission_heading: 'Our Mission',
  mission_body:
    'TODO: write a short paragraph describing the mission of the church - why you exist and who you serve.',
  beliefs_heading: 'What We Believe',
  beliefs_body:
    'TODO: summarize your core beliefs in a few sentences. Feel free to link to a longer statement of faith later.',
  story_heading: 'Our Story',
  story_body:
    'TODO: a brief history of the church - when it was founded, key moments, where it is today.',
  values_heading: 'Our Values',
  values_item_1: 'TODO: first core value',
  values_item_2: 'TODO: second core value',
  values_item_3: 'TODO: third core value',
  values_item_4: 'TODO: fourth core value',
}

async function loadSections(locale: string): Promise<{ sections: Record<string, string>; machineTranslated: boolean }> {
  try {
    const data = await getPageContent('about', locale)
    return {
      sections: { ...defaults, ...data.sections },
      machineTranslated: data.machine_translated ?? false,
    }
  } catch {
    return { sections: defaults, machineTranslated: false }
  }
}

export default async function AboutPage() {
  const locale = await getLocale()
  const { sections: s, machineTranslated } = await loadSections(locale)

  const valueItems = [s.values_item_1, s.values_item_2, s.values_item_3, s.values_item_4]

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-12 text-center">
        <h1 className="mb-3 font-serif text-4xl font-bold tracking-tight text-foreground">
          {s.hero_title}
        </h1>
        <p className="font-sans text-lg text-muted">{s.hero_subtitle}</p>
        {/*
          Page-level translation notice sits under the subtitle so it's part
          of the header context, not floating mid-page. Only renders on a
          non-English request where at least one section is unapproved AI.
        */}
        {machineTranslated && (
          <div className="mt-3">
            <MachineTranslatedBadge />
          </div>
        )}
      </header>

      {/* Mission */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-foreground">{s.mission_heading}</h2>
        <p className="font-sans leading-relaxed text-muted">{s.mission_body}</p>
      </section>

      {/* Beliefs */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-foreground">{s.beliefs_heading}</h2>
        <p className="font-sans leading-relaxed text-muted">{s.beliefs_body}</p>
      </section>

      {/* Story */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 font-serif text-2xl font-semibold text-foreground">{s.story_heading}</h2>
        <p className="font-sans leading-relaxed text-muted">{s.story_body}</p>
      </section>

      {/* Values */}
      <section className="rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 font-serif text-2xl font-semibold text-foreground">{s.values_heading}</h2>
        <ul className="space-y-2">
          {valueItems.map((item, i) => (
            <li key={i} className="flex items-start gap-3 font-sans text-muted">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

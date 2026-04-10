import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About — Our Church',
}

// ============================================================
// EDIT THIS BLOCK TO UPDATE THE ABOUT PAGE
// Church leaders / future editors: all the text on this page
// lives in the `content` object below. You do not need to touch
// anything else in this file. Replace each "TODO" string with
// real copy when you are ready.
// ============================================================
const content = {
  hero: {
    title: 'About Our Church',
    subtitle: 'TODO: one-line tagline that captures who you are',
  },
  mission: {
    heading: 'Our Mission',
    body: 'TODO: write a short paragraph describing the mission of the church — why you exist and who you serve.',
  },
  beliefs: {
    heading: 'What We Believe',
    body: 'TODO: summarize your core beliefs in a few sentences. Feel free to link to a longer statement of faith later.',
  },
  story: {
    heading: 'Our Story',
    body: 'TODO: a brief history of the church — when it was founded, key moments, where it is today.',
  },
  values: {
    heading: 'Our Values',
    items: [
      'TODO: first core value',
      'TODO: second core value',
      'TODO: third core value',
      'TODO: fourth core value',
    ],
  },
}
// ============================================================

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground">
          {content.hero.title}
        </h1>
        <p className="text-lg text-muted">{content.hero.subtitle}</p>
      </header>

      {/* Mission */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 text-2xl font-semibold text-foreground">
          {content.mission.heading}
        </h2>
        <p className="leading-relaxed text-muted">{content.mission.body}</p>
      </section>

      {/* Beliefs */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 text-2xl font-semibold text-foreground">
          {content.beliefs.heading}
        </h2>
        <p className="leading-relaxed text-muted">{content.beliefs.body}</p>
      </section>

      {/* Story */}
      <section className="mb-10 rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-3 text-2xl font-semibold text-foreground">
          {content.story.heading}
        </h2>
        <p className="leading-relaxed text-muted">{content.story.body}</p>
      </section>

      {/* Values */}
      <section className="rounded-xl border border-border bg-surface/50 p-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">
          {content.values.heading}
        </h2>
        <ul className="space-y-2">
          {content.values.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-muted">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

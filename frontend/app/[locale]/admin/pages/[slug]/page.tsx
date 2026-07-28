'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import { apiGet, apiPut } from '@/lib/api'
import PageBlockEditor from '@/components/features/admin/PageBlockEditor'

// PAGE_SCHEMA drives the fixed-field editor. Only Connect uses it now: its
// content is structured data (a service day, a street address, an email), and
// a fixed typed field is the right shape for that. About moved to the block
// editor because its content is prose, where the admin needs to add, remove
// and reorder sections without a code change.
type PageSchema = {
  label: string
  groups: { heading: string; keys: { key: string; label: string; multiline?: boolean }[] }[]
}

const PAGE_SCHEMA: Record<string, PageSchema> = {
  connect: {
    label: 'Connect',
    groups: [
      {
        heading: 'Hero',
        keys: [
          { key: 'hero_title', label: 'Title' },
          { key: 'hero_subtitle', label: 'Subtitle' },
        ],
      },
      {
        heading: 'Service Times',
        keys: [
          { key: 'service_times_heading', label: 'Heading' },
          { key: 'service_time_1_day', label: 'Service 1 - Day' },
          { key: 'service_time_1_time', label: 'Service 1 - Time' },
          { key: 'service_time_1_label', label: 'Service 1 - Label' },
          { key: 'service_time_2_day', label: 'Service 2 - Day' },
          { key: 'service_time_2_time', label: 'Service 2 - Time' },
          { key: 'service_time_2_label', label: 'Service 2 - Label' },
        ],
      },
      {
        heading: 'Location',
        keys: [
          { key: 'location_heading', label: 'Heading' },
          { key: 'location_address', label: 'Address' },
          { key: 'location_city_state_zip', label: 'City, State, Zip' },
          { key: 'location_directions_note', label: 'Directions Note' },
        ],
      },
      {
        heading: 'Contact',
        keys: [
          { key: 'contact_heading', label: 'Heading' },
          { key: 'contact_email', label: 'Email' },
          { key: 'contact_phone', label: 'Phone' },
          { key: 'contact_note', label: 'Note' },
        ],
      },
      {
        heading: 'Plan a Visit',
        keys: [
          { key: 'plan_a_visit_heading', label: 'Heading' },
          { key: 'plan_a_visit_body', label: 'Body', multiline: true },
        ],
      },
    ],
  },
}

// AdminPageEditor is a thin router: it owns the auth gate, then hands off to
// whichever editor suits the page's content shape. All hooks it uses are called
// before any conditional return, so the dispatch below is safe.
export default function AdminPageEditor({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { session, isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading...</p>
      </div>
    )
  }

  if (!session || !isAdmin) {
    router.push('/')
    return null
  }

  // Block-model pages. Listed explicitly rather than inferred so a typo in the
  // URL falls through to the "Unknown page" branch instead of silently opening
  // an empty block editor against a slug that does not exist.
  if (slug === 'about') {
    return <PageBlockEditor slug={slug} />
  }

  const schema = PAGE_SCHEMA[slug]
  if (!schema) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-sans text-muted">Unknown page: <code>{slug}</code></p>
      </div>
    )
  }

  return <SectionsEditor slug={slug} schema={schema} />
}

// SectionsEditor is the original fixed-field form, unchanged in behaviour and
// now scoped to Connect. Extracted into its own component so its data-fetching
// hooks are not run for pages that never use sections.
function SectionsEditor({ slug, schema }: { slug: string; schema: PageSchema }) {
  const { session } = useAuth()
  const router = useRouter()

  const [sections, setSections] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setLoadingContent(true)
    apiGet(`/api/v1/pages/${slug}`)
      .then((data) => setSections(data?.sections ?? {}))
      .catch(() => {})
      .finally(() => setLoadingContent(false))
  }, [slug])

  function handleChange(key: string, value: string) {
    setSections((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      await apiPut(`/api/v1/pages/${slug}`, { sections }, session.access_token)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 font-serif text-3xl font-bold text-foreground">
        Edit {schema.label} Page
      </h1>

      {loadingContent ? (
        <p className="font-sans text-muted">Loading content...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          {schema.groups.map((group) => (
            // min-w-0 for the same reason as PageBlockEditor: the UA stylesheet's
            // `min-inline-size: min-content` on fieldset is not reset by Tailwind's
            // preflight, so inputs' intrinsic width can push the group past the
            // viewport on a narrow screen.
            <fieldset key={group.heading} className="min-w-0 space-y-4 rounded-xl border border-border p-6">
              <legend className="px-2 font-display text-sm font-semibold uppercase tracking-wider text-muted">
                {group.heading}
              </legend>
              {group.keys.map(({ key, label, multiline }) => (
                <div key={key}>
                  <label
                    htmlFor={key}
                    className="mb-1 block font-display text-sm font-medium text-foreground"
                  >
                    {label}
                  </label>
                  {multiline ? (
                    <textarea
                      id={key}
                      value={sections[key] ?? ''}
                      onChange={(e) => handleChange(key, e.target.value)}
                      rows={4}
                      className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  ) : (
                    <input
                      id={key}
                      type="text"
                      value={sections[key] ?? ''}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="block w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-sans text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </fieldset>
          ))}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-700">
              Page content saved successfully.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-5 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-primary-light disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="rounded-lg border border-border px-5 py-2.5 font-display text-sm font-medium text-muted transition-colors hover:bg-surface"
            >
              Back to Admin
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

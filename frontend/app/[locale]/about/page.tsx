import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { getPageContent, type PageBlock } from '@/lib/pages'
import PageBlocks from '@/components/features/pages/PageBlocks'

export const metadata: Metadata = {
  title: 'About - Our Church',
}

export const revalidate = 60

// Placeholder blocks shown only when the backend returns no blocks at all -
// a fresh database, or the API being unreachable. Once an admin saves the page
// once, these are never seen again.
//
// They are blocks rather than a key-value map because the page has no fixed
// sections any more: what renders is whatever the admin has built, and this is
// just a starting shape for that.
const defaultBlocks: PageBlock[] = [
  {
    block_type: 'hero',
    position: 0,
    title: 'About Our Church',
    content: 'TODO: one-line tagline that captures who you are',
    props: {},
  },
  {
    block_type: 'rich_text',
    position: 1,
    title: 'Our Mission',
    content:
      '<p>TODO: write a short paragraph describing the mission of the church - why you exist and who you serve.</p>',
    props: {},
  },
  {
    block_type: 'rich_text',
    position: 2,
    title: 'What We Believe',
    content:
      '<p>TODO: summarize your core beliefs in a few sentences. Feel free to link to a longer statement of faith later.</p>',
    props: {},
  },
  {
    block_type: 'rich_text',
    position: 3,
    title: 'Our Story',
    content:
      '<p>TODO: a brief history of the church - when it was founded, key moments, where it is today.</p>',
    props: {},
  },
  {
    block_type: 'rich_text',
    position: 4,
    title: 'Our Values',
    content:
      '<ul><li>TODO: first core value</li><li>TODO: second core value</li><li>TODO: third core value</li><li>TODO: fourth core value</li></ul>',
    props: {},
  },
]

async function loadBlocks(
  locale: string,
): Promise<{ blocks: PageBlock[]; machineTranslated: boolean }> {
  try {
    const data = await getPageContent('about', locale)
    return {
      blocks: data.blocks.length > 0 ? data.blocks : defaultBlocks,
      machineTranslated: data.machine_translated ?? false,
    }
  } catch {
    return { blocks: defaultBlocks, machineTranslated: false }
  }
}

export default async function AboutPage() {
  const locale = await getLocale()
  const { blocks, machineTranslated } = await loadBlocks(locale)

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <PageBlocks blocks={blocks} machineTranslated={machineTranslated} />
    </div>
  )
}

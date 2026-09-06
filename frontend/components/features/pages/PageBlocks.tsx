import type { ReactNode } from 'react'
import type { PageBlock } from '@/lib/pages'
import { RichContent } from '@/components/editor/RichContent'
import MachineTranslatedBadge from '@/components/ui/MachineTranslatedBadge'

// PageBlocks is the render half of the block registry. The admin editor holds
// the authoring half (BLOCK_META in PageBlockEditor) and Go holds the storage
// half (model.AllowedBlockTypes); adding a block type means one entry in each.
//
// The important property here is that this file encodes only *how a block
// looks*, never *what the page says*. A page's wording, section count and
// section order all live in the database, so changing them is an admin action
// rather than a deploy.
//
// Prose pages are flat: sections sit directly on the field, separated by
// space and a magenta heading with the brand rule under it. Cards are for
// posts; wrapping every paragraph in a box made About read as a stack of
// widgets instead of a page.

// BlockContext carries page-level state a single block may need to render.
// Today that is only the translation notice, which belongs visually inside the
// hero rather than floating above the page.
interface BlockContext {
  machineTranslated: boolean
}

function HeroBlock({ block, ctx }: { block: PageBlock; ctx: BlockContext }) {
  return (
    <header className="mb-14">
      <h1 className="t-title">{block.title}</h1>
      {block.content && <p className="t-body mt-4 max-w-[60ch] text-lg text-muted">{block.content}</p>}
      {/* Sits under the subtitle so it reads as part of the header context,
          not as a floating mid-page warning. Only renders on a non-English
          request where at least one field is unapproved AI output. */}
      {ctx.machineTranslated && (
        <div className="mt-3">
          <MachineTranslatedBadge />
        </div>
      )}
    </header>
  )
}

function RichTextBlock({ block }: { block: PageBlock }) {
  return (
    <section className="mb-14">
      {/* Both fields are optional: a section can be a heading with no body
          (a divider) or a body with no heading (continued prose). */}
      {block.title && (
        <>
          <h2 className="t-section">{block.title}</h2>
          <div aria-hidden className="brand-rule mb-5 mt-3" />
        </>
      )}
      {block.content && <RichContent html={block.content} className="t-body" />}
    </section>
  )
}

function QuoteBlock({ block }: { block: PageBlock }) {
  const attribution = typeof block.props?.attribution === 'string' ? block.props.attribution : ''
  return (
    // A lavender panel, not a side stripe: the quote is a moment on the page,
    // and the display face at reading size carries the voice.
    <figure className="mb-14 rounded-[14px] bg-panel px-6 py-6 sm:px-8">
      <RichContent
        html={block.content}
        className="font-heading text-[1.4rem] font-medium leading-snug text-foreground"
      />
      {attribution && (
        <figcaption className="t-meta mt-4">{attribution}</figcaption>
      )}
    </figure>
  )
}

// Keyed by string rather than PageBlockType on purpose. The database can hold a
// block type this build has never heard of - an older deploy still serving
// traffic after new content lands, or a rollback - and the lookup must be able
// to miss. A miss renders nothing; it must never throw.
const BLOCK_RENDERERS: Record<string, (block: PageBlock, ctx: BlockContext) => ReactNode> = {
  hero: (block, ctx) => <HeroBlock block={block} ctx={ctx} />,
  rich_text: (block) => <RichTextBlock block={block} />,
  quote: (block) => <QuoteBlock block={block} />,
}

interface PageBlocksProps {
  blocks: PageBlock[]
  machineTranslated?: boolean
}

export default function PageBlocks({ blocks, machineTranslated = false }: PageBlocksProps) {
  const ctx: BlockContext = { machineTranslated }

  return (
    <>
      {blocks.map((block, i) => {
        const render = BLOCK_RENDERERS[block.block_type]
        // Unknown type: skip it. A stale frontend renders the page minus one
        // section instead of crashing on every visit.
        if (!render) return null
        return <div key={block.id ?? `block-${i}`}>{render(block, ctx)}</div>
      })}
    </>
  )
}

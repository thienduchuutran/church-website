import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

// Indent adds a paragraph/heading indent level, stored as an `indent` node
// attribute and rendered as inline `margin-left`.
//
// Why this exists at all: Tiptap's StarterKit gives you *list* nesting for free
// (ListItem binds Tab/Shift-Tab to sinkListItem/liftListItem), but there is no
// built-in way to indent a plain paragraph. Page sections are prose, and prose
// needs the same "push this block right" affordance every word processor has.
//
// Why an attribute rather than nested blockquotes: an attribute round-trips
// through sanitize-html cleanly (one allow-listed style), survives copy/paste,
// and cannot change the document's semantic structure - a nested blockquote
// would tell a screen reader "this is a quotation" when the author only meant
// "move this over a bit".
export const INDENT_STEP_REM = 1.5
export const MAX_INDENT = 4

// The exact strings the sanitizer allow-lists in lib/sanitizeBody.ts. If these
// diverge, indents are silently stripped on save - the two lists must agree.
function marginFor(level: number): string {
  return `${level * INDENT_STEP_REM}rem`
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

export interface IndentOptions {
  types: string[]
}

export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            // Read an existing margin-left back into a level so pasted or
            // previously-saved content keeps its indentation instead of
            // snapping to 0 on the next edit.
            parseHTML: (element) => {
              const raw = parseFloat(element.style.marginLeft || '0')
              if (!raw || Number.isNaN(raw)) return 0
              return Math.min(MAX_INDENT, Math.max(0, Math.round(raw / INDENT_STEP_REM)))
            },
            renderHTML: (attributes) => {
              const level = Number(attributes.indent) || 0
              if (level <= 0) return {}
              return { style: `margin-left: ${marginFor(level)}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    // shift walks every block in the selection that is one of the configured
    // types and clamps its level into [0, MAX_INDENT]. Returns false when
    // nothing moved so the keymap can fall through to another handler.
    const shift = (delta: number) => () => ({
      state,
      dispatch,
    }: {
      state: import('@tiptap/pm/state').EditorState
      dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void
    }) => {
      const { from, to } = state.selection
      const tr = state.tr
      let changed = false

      state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
        if (!this.options.types.includes(node.type.name)) return true
        const current = Number(node.attrs.indent) || 0
        const next = Math.min(MAX_INDENT, Math.max(0, current + delta))
        if (next === current) return true
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
        changed = true
        return true
      })

      if (changed && dispatch) dispatch(tr)
      return changed
    }

    return {
      indent: shift(1),
      outdent: shift(-1),
    }
  },

  addKeyboardShortcuts() {
    // Deliberately NOT bound to Tab. Tab is the only way a keyboard user
    // leaves a contenteditable region; hijacking it globally would trap focus
    // in the editor. Inside a list Tab still nests (ListItem owns it), and
    // Mod-] / Mod-[ is the same pair Google Docs uses for paragraph indent.
    // The toolbar buttons carry discoverability for everyone else.
    return {
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
    }
  },
})

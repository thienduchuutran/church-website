'use client'

import React from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { CALLOUT_VARIANTS, type CalloutVariant } from '../constants'

interface CalloutNodeViewProps {
  node: { attrs: { variant: string } }
  deleteNode: () => void
}

function CalloutNodeView({ node, deleteNode }: CalloutNodeViewProps) {
  const variant = (node.attrs.variant as CalloutVariant) in CALLOUT_VARIANTS
    ? (node.attrs.variant as CalloutVariant)
    : 'announcement'
  const config = CALLOUT_VARIANTS[variant]

  return (
    <NodeViewWrapper
      className={`callout callout-${variant}`}
      data-callout=""
      data-callout-variant={variant}
    >
      <div className="callout-icon-wrap" style={{ background: config.color }}>
        <span role="img" aria-label={config.label}>{config.icon}</span>
      </div>
      <div className="callout-content-wrap">
        <div className="callout-label" style={{ color: config.color }}>
          {config.label}
        </div>
        <NodeViewContent as="p" className="callout-text" />
      </div>
      <button
        className="callout-delete-btn"
        onClick={deleteNode}
        aria-label="Delete callout block"
        contentEditable={false}
        type="button"
      >
        &times;
      </button>
    </NodeViewWrapper>
  )
}

export const CalloutBlock = Node.create({
  name: 'calloutBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: { default: 'announcement' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-callout]',
        getAttrs: (el) => ({
          variant: (el as HTMLElement).getAttribute('data-callout-variant') ?? 'announcement',
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        'data-callout-variant': node.attrs.variant,
        class: `callout callout-${node.attrs.variant}`,
      }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView)
  },
})

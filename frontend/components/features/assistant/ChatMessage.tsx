'use client'

import type { AssistantSource } from '@/lib/assistant'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  sources?: AssistantSource[]
}

/**
 * ChatMessage renders a single message bubble in the chatbox.
 * User messages align right with terracotta tint; assistant messages align left
 * on warm cream with a bisque border. Sources render as small chips below.
 */
export default function ChatMessage({ role, content, sources }: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-surface border border-border text-foreground rounded-bl-md'
        }`}
      >
        {/* Render markdown-lite: bold and line breaks */}
        <div
          className="whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{
            __html: formatContent(content),
          }}
        />

        {/* Source chips */}
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
            {sources.slice(0, 4).map((source) => (
              <span
                key={source.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                title={source.title}
              >
                {sourceIcon(source.type)}
                <span className="max-w-[120px] truncate">{source.title}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Returns a small emoji icon for the source type. */
function sourceIcon(type: string): string {
  switch (type) {
    case 'post':
      return '📋'
    case 'calendar_event':
      return '📅'
    case 'page':
      return '📄'
    default:
      return '📌'
  }
}

/**
 * Simple markdown-lite formatter: converts **bold** and newlines to HTML.
 * Escapes HTML first to prevent XSS from LLM output.
 */
function formatContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
}

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ChatMessage from './ChatMessage'
import TypingIndicator from './TypingIndicator'
import {
  chatWithAssistant,
  type AssistantMessage,
  type AssistantSource,
} from '@/lib/assistant'

/** Stored message with optional sources for assistant replies. */
interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  sources?: AssistantSource[]
}

/** Preset quick-question chips shown when the chat is empty. */
const QUICK_QUESTIONS = [
  'When is the next event?',
  'What are the service times?',
  'Tell me about the church',
  'How can I get connected?',
]

/**
 * ChatBox is the floating AI assistant widget for the church website.
 * It renders as a small FAB in the bottom-right corner and expands into a
 * full chat panel. Available on every page via layout.tsx.
 */
export default function ChatBox() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when chat opens.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      setError(null)
      setInput('')

      // Add user message immediately.
      const userEntry: ChatEntry = { role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userEntry])
      setIsLoading(true)

      try {
        // Build history from previous messages (role + content only).
        const history: AssistantMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        const resp = await chatWithAssistant(trimmed, history)

        const assistantEntry: ChatEntry = {
          role: 'assistant',
          content: resp.answer,
          sources: resp.sources,
        }
        setMessages((prev) => [...prev, assistantEntry])
      } catch (err) {
        console.error('Assistant chat error:', err)
        setError("Sorry, I couldn't process your question right now. Please try again.")
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, messages],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleQuickQuestion = (question: string) => {
    sendMessage(question)
  }

  return (
    <>
      {/* ── Floating Action Button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          aria-label="Open VGOMNE Helper chat"
          id="chatbox-fab"
        >
          {/* Chat bubble icon */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>

          {/* Subtle pulse ring */}
          <span className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
        </button>
      )}

      {/* ── Chat Panel ── */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-2xl transition-all duration-300"
          style={{
            animation: 'chatbox-slide-up 0.3s ease-out',
          }}
          role="dialog"
          aria-label="VGOMNE Helper chat"
          id="chatbox-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary"
                >
                  <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-serif text-sm font-semibold text-foreground leading-tight">
                  VGOMNE Helper
                </h3>
                <p className="text-[11px] text-muted">Ask about our church</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary/5 hover:text-foreground"
              aria-label="Close chat"
              id="chatbox-close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3" id="chatbox-messages">
            {/* Welcome + quick questions when empty */}
            {messages.length === 0 && !isLoading && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-primary"
                  >
                    <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z" />
                  </svg>
                </div>
                <h4 className="font-serif text-base font-semibold text-foreground mb-1">
                  Welcome!
                </h4>
                <p className="mb-4 text-xs text-muted leading-relaxed max-w-[240px]">
                  I'm the VGOMNE Helper. Ask me anything about our church, events, or service times.
                </p>

                {/* Quick question chips */}
                <div className="flex flex-col gap-2 w-full px-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickQuestion(q)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                      id={`chatbox-quick-${q.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role}
                content={msg.content}
                sources={msg.sources}
              />
            ))}

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}

            {/* Error message */}
            {error && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border bg-background px-3 py-2.5"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={isLoading}
              maxLength={1000}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              id="chatbox-input"
              aria-label="Type your question"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all duration-200 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
              id="chatbox-send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}

    </>
  )
}

import { apiPostAnon } from '@/lib/api'

// --- Types ---

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantSource {
  id: string
  type: 'post' | 'calendar_event' | 'page'
  title: string
}

export interface AssistantChatResponse {
  answer: string
  sources: AssistantSource[]
}

// --- API ---

/**
 * Sends a message to the VGOMNE Helper AI assistant.
 * This is a public endpoint — no auth token needed.
 */
export async function chatWithAssistant(
  message: string,
  history: AssistantMessage[] = [],
): Promise<AssistantChatResponse> {
  return apiPostAnon('/api/v1/assistant/chat', { message, history })
}

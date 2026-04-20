import { EventEmitter } from 'node:events'

export type ChatEventName =
  | 'session_start'
  | 'message_received'
  | 'agent_started'
  | 'agent_completed'
  | 'error'
  | 'session_end'

export type ChatEventPayload = {
  session_start: { chatId: string; sessionId: string; agentId: string }
  message_received: { chatId: string; sessionId: string; text: string; messageId?: string }
  agent_started: { chatId: string; sessionId: string; agentId: string; backend: 'claude' | 'codex' }
  agent_completed: {
    chatId: string
    sessionId: string
    durationMs: number
    tokens?: number
    outcome: 'ok' | 'error' | 'timeout'
  }
  error: { chatId?: string; sessionId?: string; category: string; message: string }
  session_end: { chatId: string; sessionId: string; reason: string }
}

type ListenerMap = {
  [K in ChatEventName]: Array<(payload: ChatEventPayload[K]) => void>
}

class ChatEventBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // Default setting is 10; we expect a handful of listeners (logger, audit, dashboard SSE).
    this.emitter.setMaxListeners(50)
  }

  on<K extends ChatEventName>(event: K, handler: (payload: ChatEventPayload[K]) => void): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void)
  }

  off<K extends ChatEventName>(event: K, handler: (payload: ChatEventPayload[K]) => void): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void)
  }

  emit<K extends ChatEventName>(event: K, payload: ChatEventPayload[K]): void {
    this.emitter.emit(event, payload)
  }
}

export const chatEvents = new ChatEventBus()

export type { ListenerMap }

export type SubagentHint =
  | 'ui'
  | 'ux'
  | 'design'
  | 'visual'
  | 'layout'
  | 'css'
  | 'mockup'
  | 'code'
  | 'refactor'
  | 'debug'
  | 'test'
  | 'research'
  | 'summary'
  | 'plan'
  | 'reasoning'
  | 'idea'
  | 'misc'

export type SubagentInput = {
  prompt: string
  hints?: SubagentHint[]
  files?: string[]
  timeoutMs?: number
  chatId?: string
}

export type SubagentResult = {
  backend: string
  text: string
  sessionId?: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  toolCallsUsed?: number
  error?: string
}

export interface SubagentBackend {
  readonly name: string
  run(input: SubagentInput): Promise<SubagentResult>
}

export type RunMode = 'single' | 'council'

export type AggregatorKind = 'best-of-n' | 'merge' | 'vote'

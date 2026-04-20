import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import { AGENT_MAX_TURNS, AGENT_TIMEOUT_MS } from './config.js'
import { classifyError, isRetryable } from './errors.js'
import { loadAgentConfig, resolveAgentDir } from './agent-config.js'
import { logger } from './logger.js'
import { appendConversation, recordTokenUsage, upsertSession } from './db.js'

export type AgentRunInput = {
  chatId: string
  agentId?: string
  prompt: string
  sessionId?: string // resume
  abortSignal?: AbortSignal
  extraOptions?: Partial<Options>
}

export type AgentRunResult = {
  text: string
  sessionId: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  toolCallsUsed: number
  costUsd?: number
  model?: string
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const agentId = input.agentId ?? 'main'
  const cfg = loadAgentConfig(agentId)
  const cwd = resolveAgentDir(agentId) ?? process.cwd()
  const startedAt = Date.now()

  const options: Options = {
    cwd,
    model: cfg.model,
    settingSources: ['project', 'user'],
    permissionMode: 'bypassPermissions',
    maxTurns: cfg.maxTurns ?? AGENT_MAX_TURNS,
    ...(input.sessionId ? { resume: input.sessionId } : {}),
    ...(input.abortSignal ? { abortController: abortFromSignal(input.abortSignal) } : {}),
    ...input.extraOptions,
  }

  const result: AgentRunResult = {
    text: '',
    sessionId: input.sessionId ?? '',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCallsUsed: 0,
  }

  const timeout = setTimeout(() => {
    options.abortController?.abort()
  }, AGENT_TIMEOUT_MS)
  timeout.unref()

  try {
    for await (const message of query({ prompt: input.prompt, options }) as AsyncIterable<SDKMessage>) {
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init') {
            result.sessionId = message.session_id
          }
          break
        case 'assistant': {
          // Count tool_use entries for visibility.
          const content = (message as { message?: { content?: Array<{ type: string }> } }).message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') result.toolCallsUsed += 1
            }
          }
          break
        }
        case 'result':
          if (message.subtype === 'success') {
            result.text = message.result
            result.durationMs = message.duration_ms
            result.costUsd = message.total_cost_usd
            result.inputTokens = message.usage.input_tokens ?? 0
            result.outputTokens = message.usage.output_tokens ?? 0
            const firstModel = Object.keys(message.modelUsage)[0]
            if (firstModel) result.model = firstModel
          } else {
            throw new Error(`agent run failed: ${message.subtype}`)
          }
          break
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!result.sessionId) result.sessionId = randomUUID()
  if (result.durationMs === 0) result.durationMs = Date.now() - startedAt

  persistRun(input.chatId, agentId, input.prompt, result)
  return result
}

function persistRun(chatId: string, agentId: string, prompt: string, res: AgentRunResult): void {
  try {
    upsertSession(res.sessionId, chatId, agentId)
    appendConversation(res.sessionId, chatId, 'user', prompt, agentId)
    if (res.text) appendConversation(res.sessionId, chatId, 'assistant', res.text, agentId)
    recordTokenUsage({
      sessionId: res.sessionId,
      chatId,
      agentId,
      backend: 'claude',
      model: res.model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      durationMs: res.durationMs,
    })
  } catch (err) {
    logger.error({ err, chatId, agentId }, 'failed to persist agent run')
  }
}

function abortFromSignal(signal: AbortSignal): AbortController {
  const ctrl = new AbortController()
  if (signal.aborted) ctrl.abort()
  else signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  return ctrl
}

export async function runAgentWithRetry(
  input: AgentRunInput,
  attempts = 3
): Promise<AgentRunResult> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await runAgent(input)
    } catch (err) {
      const category = classifyError(err)
      lastErr = err
      logger.warn(
        { attempt: i, category, err: err instanceof Error ? err.message : String(err) },
        'agent run failed'
      )
      if (!isRetryable(category) || i === attempts) throw err
      await new Promise(r => setTimeout(r, 500 * 2 ** i))
    }
  }
  throw lastErr
}

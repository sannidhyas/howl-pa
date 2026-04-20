import { recordSubagentRun } from '../db.js'
import { logger } from '../logger.js'
import { ClaudeBackend } from './claude.js'
import { CodexBackend } from './codex.js'
import { OllamaBackend } from './ollama.js'
import type { AggregatorKind, RunMode, SubagentBackend, SubagentInput, SubagentResult } from './types.js'
import { runCouncil } from './aggregator.js'

const DESIGN_HINTS = new Set(['ui', 'ux', 'design', 'visual', 'layout', 'css', 'mockup'])

const claude = new ClaudeBackend()
const codex = new CodexBackend()

const ollamaModels = (process.env.OLLAMA_MODELS ?? 'qwen3-coder,ministral-3')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const ollama = new Map<string, OllamaBackend>()
for (const m of ollamaModels) ollama.set(m, new OllamaBackend(m))

const BACKENDS: Record<string, SubagentBackend> = {
  claude,
  codex,
  ...Object.fromEntries([...ollama.entries()].map(([m, b]) => [`ollama:${m}`, b])),
}

export function availableBackends(): string[] {
  return Object.keys(BACKENDS)
}

export type DispatchOptions = {
  mode?: RunMode
  members?: string[]
  aggregator?: AggregatorKind
  judge?: string
  forcedBackend?: string
}

export type DispatchOutcome = {
  final: string
  mode: RunMode
  backendsUsed: string[]
  winner?: string
  members: SubagentResult[]
  durationMs: number
}

function pickSingleBackend(input: SubagentInput, forced?: string): SubagentBackend {
  if (forced && BACKENDS[forced]) return BACKENDS[forced]!
  const hints = (input.hints ?? []).map(h => h.toLowerCase())
  const lowerPrompt = input.prompt.toLowerCase()
  const isDesign = hints.some(h => DESIGN_HINTS.has(h)) ||
    [...DESIGN_HINTS].some(h => lowerPrompt.includes(` ${h} `))
  return isDesign ? claude : codex
}

function detectMode(input: SubagentInput, opts: DispatchOptions): RunMode {
  if (opts.mode) return opts.mode
  const hints = (input.hints ?? []).map(h => h.toLowerCase())
  if (hints.includes('idea') || hints.includes('reasoning') || hints.includes('plan')) return 'council'
  return 'single'
}

function resolveMembers(names: string[] | undefined, fallback: string[]): SubagentBackend[] {
  const list = (names ?? fallback).map(n => BACKENDS[n]).filter((b): b is SubagentBackend => Boolean(b))
  return list.length > 0 ? list : [codex, claude]
}

function pickCouncilMembers(input: SubagentInput, opts: DispatchOptions): string[] {
  if (opts.members && opts.members.length > 0) return opts.members
  const hints = (input.hints ?? []).map(h => h.toLowerCase())
  const list: string[] = []
  if (hints.includes('idea') || hints.includes('plan')) {
    list.push('codex', 'claude')
    const firstOllama = [...ollama.keys()][0]
    if (firstOllama) list.push(`ollama:${firstOllama}`)
    return list
  }
  if (hints.includes('code') || hints.includes('refactor') || hints.includes('debug')) {
    list.push('codex')
    if (ollama.has('qwen3-coder')) list.push('ollama:qwen3-coder')
    else {
      const firstOllama = [...ollama.keys()][0]
      if (firstOllama) list.push(`ollama:${firstOllama}`)
    }
    return list
  }
  list.push('claude', 'codex')
  const firstOllama = [...ollama.keys()][0]
  if (firstOllama) list.push(`ollama:${firstOllama}`)
  return list
}

function resolveJudge(opts: DispatchOptions, fallback: string = 'claude'): SubagentBackend {
  const name = opts.judge ?? process.env.COUNCIL_JUDGE ?? fallback
  return BACKENDS[name] ?? claude
}

function defaultAggregator(input: SubagentInput, opts: DispatchOptions): AggregatorKind {
  if (opts.aggregator) return opts.aggregator
  const hints = (input.hints ?? []).map(h => h.toLowerCase())
  if (hints.includes('vote')) return 'vote'
  if (hints.includes('idea') || hints.includes('research') || hints.includes('summary')) return 'merge'
  return 'best-of-n'
}

export async function dispatchSubagent(
  input: SubagentInput,
  opts: DispatchOptions = {}
): Promise<DispatchOutcome> {
  const start = Date.now()
  const mode = detectMode(input, opts)
  const promptPreview = input.prompt.slice(0, 240)

  if (mode === 'single') {
    const backend = pickSingleBackend(input, opts.forcedBackend)
    const result = await backend.run(input).catch<SubagentResult>(err => ({
      backend: backend.name,
      text: '',
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    }))
    recordSubagentRun({
      chatId: input.chatId,
      mode,
      backend: backend.name,
      hints: (input.hints ?? []).join(','),
      promptPreview,
      durationMs: result.durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      outcome: result.error ? 'error' : 'ok',
    })
    return {
      final: result.error ? `⚠️ ${backend.name}: ${result.error}` : result.text,
      mode,
      backendsUsed: [backend.name],
      winner: backend.name,
      members: [result],
      durationMs: Date.now() - start,
    }
  }

  const memberNames = pickCouncilMembers(input, opts)
  const members = resolveMembers(memberNames, memberNames)
  const judge = resolveJudge(opts)
  const aggregator = defaultAggregator(input, opts)

  logger.info({ aggregator, members: members.map(m => m.name), judge: judge.name }, 'council dispatch')

  const outcome = await runCouncil({ input, members, aggregator, judge })

  const backendsUsed = members.map(m => m.name)
  const fullOk = outcome.members.every(r => !r.error)
  recordSubagentRun({
    chatId: input.chatId,
    mode,
    backend: backendsUsed.join('|'),
    judge: judge.name,
    hints: (input.hints ?? []).join(','),
    promptPreview,
    durationMs: Date.now() - start,
    outcome: fullOk ? 'ok' : 'partial',
  })

  return {
    final: outcome.final,
    mode,
    backendsUsed,
    winner: outcome.winner,
    members: outcome.members,
    durationMs: Date.now() - start,
  }
}

export { BACKENDS }

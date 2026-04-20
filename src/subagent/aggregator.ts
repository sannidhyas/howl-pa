import type { AggregatorKind, SubagentBackend, SubagentInput, SubagentResult } from './types.js'
import { logger } from '../logger.js'

const JUDGE_TIMEOUT_MS = 180_000

export type AggregationOutcome = {
  final: string
  winner?: string
  members: SubagentResult[]
}

function surviving(results: SubagentResult[]): SubagentResult[] {
  return results.filter(r => r.text && r.text.trim().length > 0 && !r.error)
}

export async function runCouncil(args: {
  input: SubagentInput
  members: SubagentBackend[]
  aggregator: AggregatorKind
  judge: SubagentBackend
}): Promise<AggregationOutcome> {
  const { input, members, aggregator, judge } = args
  const results = await Promise.all(members.map(m => m.run(input).catch<SubagentResult>((err) => ({
    backend: m.name,
    text: '',
    durationMs: 0,
    error: err instanceof Error ? err.message : String(err),
  }))))

  const ok = surviving(results)
  if (ok.length === 0) {
    return { final: '(all council members failed)', members: results }
  }
  if (ok.length === 1) {
    return { final: ok[0]!.text, winner: ok[0]!.backend, members: results }
  }

  switch (aggregator) {
    case 'best-of-n':
      return await bestOfN(ok, results, judge, input)
    case 'merge':
      return await mergeSynthesize(ok, results, judge, input)
    case 'vote':
      return voteMajority(ok, results)
  }
}

async function bestOfN(
  ok: SubagentResult[],
  all: SubagentResult[],
  judge: SubagentBackend,
  input: SubagentInput
): Promise<AggregationOutcome> {
  const numbered = ok.map((r, i) => `### Draft ${i + 1} (${r.backend})\n${r.text.trim()}`).join('\n\n')
  const judgeInput: SubagentInput = {
    prompt:
      `You are an impartial judge. The user asked:\n\n${input.prompt}\n\n` +
      `Candidate drafts follow. Pick exactly ONE draft that best answers the prompt. Output format:\n\n` +
      `WINNER: <number>\nRATIONALE: <one sentence>\n---\n<verbatim winning draft>\n\n` +
      `Drafts:\n\n${numbered}`,
    timeoutMs: JUDGE_TIMEOUT_MS,
  }
  const judgement = await judge.run(judgeInput)
  const winnerMatch = /WINNER:\s*(\d+)/i.exec(judgement.text)
  const idx = winnerMatch ? Number.parseInt(winnerMatch[1]!, 10) - 1 : 0
  const winner = ok[idx] ?? ok[0]!
  const separator = judgement.text.indexOf('---')
  const body = separator >= 0 ? judgement.text.slice(separator + 3).trim() : winner.text
  return { final: body.length > 0 ? body : winner.text, winner: winner.backend, members: all }
}

async function mergeSynthesize(
  ok: SubagentResult[],
  all: SubagentResult[],
  judge: SubagentBackend,
  input: SubagentInput
): Promise<AggregationOutcome> {
  const numbered = ok.map((r, i) => `### Draft ${i + 1} (${r.backend})\n${r.text.trim()}`).join('\n\n')
  const judgeInput: SubagentInput = {
    prompt:
      `You are a synthesis judge. The user asked:\n\n${input.prompt}\n\n` +
      `Multiple drafts follow. Produce a single best answer by combining the strongest ideas from each draft. ` +
      `Resolve contradictions, drop filler, keep factual claims. Preserve markdown structure where relevant. ` +
      `Output only the synthesized answer — no meta-commentary.\n\n` +
      `Drafts:\n\n${numbered}`,
    timeoutMs: JUDGE_TIMEOUT_MS,
  }
  const judgement = await judge.run(judgeInput)
  if (!judgement.text.trim()) {
    logger.warn('merge judge produced empty output — falling back to draft 1')
    return { final: ok[0]!.text, winner: ok[0]!.backend, members: all }
  }
  return { final: judgement.text.trim(), winner: 'merge', members: all }
}

function voteMajority(ok: SubagentResult[], all: SubagentResult[]): AggregationOutcome {
  // Expects structured-output (yes/no/label). Normalise first token.
  const tallies = new Map<string, { count: number; sample: SubagentResult }>()
  for (const r of ok) {
    const key = r.text.trim().toLowerCase().split(/\s+/)[0] ?? ''
    if (!key) continue
    const existing = tallies.get(key)
    if (existing) existing.count += 1
    else tallies.set(key, { count: 1, sample: r })
  }
  if (tallies.size === 0) return { final: ok[0]!.text, winner: ok[0]!.backend, members: all }
  let best: { key: string; count: number; sample: SubagentResult } | null = null
  for (const [key, { count, sample }] of tallies) {
    if (!best || count > best.count) best = { key, count, sample }
  }
  if (!best) return { final: ok[0]!.text, winner: ok[0]!.backend, members: all }
  return {
    final: best.sample.text,
    winner: `vote:${best.key} (${best.count}/${ok.length})`,
    members: all,
  }
}

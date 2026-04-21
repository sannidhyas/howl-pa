import { readFileSync, writeFileSync } from 'node:fs'

type MemberResult = {
  model: string
  role: string
  text: string
  durationMs: number
  error?: string
}

const DEFAULT_MODELS = [
  'qwen2.5-coder:3b',
  'ministral-3:latest',
  'hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:TQ1_0',
]

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const TIMEOUT_MS = numberEnv('OLLAMA_COUNCIL_TIMEOUT_MS', 240_000)
const MAX_PROMPT_CHARS = numberEnv('OLLAMA_COUNCIL_MAX_PROMPT_CHARS', 90_000)
const MODELS = listEnv('OLLAMA_COUNCIL_MODELS') ?? listEnv('OLLAMA_MODELS') ?? DEFAULT_MODELS
const JUDGE_MODEL = process.env.OLLAMA_COUNCIL_JUDGE?.trim() ?? ''

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function listEnv(name: string): string[] | null {
  const raw = process.env[name]
  if (!raw) return null
  const values = raw.split(',').map(s => s.trim()).filter(Boolean)
  return values.length > 0 ? values : null
}

function roleFor(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('coder')) return 'code correctness and implementation risk reviewer'
  if (lower.includes('ministral') || lower.includes('mistral')) return 'product, planning, and failure-mode reviewer'
  if (lower.includes('30b') || lower.includes('qwen3')) return 'architecture and systems reviewer'
  return 'general technical reviewer'
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function truncate(input: string): string {
  if (input.length <= MAX_PROMPT_CHARS) return input
  const head = input.slice(0, Math.floor(MAX_PROMPT_CHARS * 0.65))
  const tail = input.slice(input.length - Math.floor(MAX_PROMPT_CHARS * 0.30))
  return `${head}\n\n[...truncated for local context budget...]\n\n${tail}`
}

async function ollamaChat(model: string, prompt: string): Promise<{ text: string; durationMs: number }> {
  const start = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  timer.unref()

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 16_384,
          num_gpu: -1,
        },
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { message?: { content?: string } }
    return { text: json.message?.content?.trim() ?? '', durationMs: Date.now() - start }
  } finally {
    clearTimeout(timer)
  }
}

async function memberReview(model: string, task: string, body: string): Promise<MemberResult> {
  const role = roleFor(model)
  const prompt = [
    `You are the ${role} in a local Ollama council.`,
    'Review the artifact below for the task. Be concrete and terse.',
    '',
    'Return markdown only with these headings:',
    '# Verdict',
    '# Blocking Issues',
    '# High-Value Fixes',
    '# Missing Verification',
    '',
    `Task: ${task}`,
    '',
    'Artifact:',
    truncate(body),
  ].join('\n')
  const start = Date.now()
  try {
    const result = await ollamaChat(model, prompt)
    return { model, role, text: result.text, durationMs: result.durationMs }
  } catch (err) {
    return {
      model,
      role,
      text: '',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function synthesize(task: string, members: MemberResult[]): Promise<string> {
  const ok = members.filter(m => m.text.trim().length > 0 && !m.error)
  if (ok.length === 0) return 'All Ollama council members failed.'

  if (!JUDGE_MODEL || JUDGE_MODEL === 'none' || JUDGE_MODEL === 'off') {
    return [
      '# Council Verdict',
      'Judge disabled; member findings follow for the primary agent to merge.',
      '',
      ...ok.map(m => `## ${m.model}\n${m.text.trim()}`),
    ].join('\n')
  }

  const drafts = ok.map((m, i) => [
    `## Draft ${i + 1}: ${m.model}`,
    `Role: ${m.role}`,
    m.text,
  ].join('\n')).join('\n\n')

  const prompt = [
    'You are the synthesis judge for a local Ollama council.',
    'Combine the useful findings into one concise, actionable review.',
    'Do not invent facts. Prefer concrete file/path/test suggestions when present.',
    '',
    'Return markdown only with these headings:',
    '# Council Verdict',
    '# Must Fix',
    '# Should Fix',
    '# Verification',
    '# Notes',
    '',
    `Task: ${task}`,
    '',
    drafts,
  ].join('\n')

  try {
    const judged = await ollamaChat(JUDGE_MODEL, prompt)
    if (judged.text.trim()) return judged.text.trim()
  } catch {
    // Fall through to deterministic merge below.
  }

  return [
    '# Council Verdict',
    'Judge failed; raw member findings follow.',
    '',
    ...ok.map(m => `## ${m.model}\n${m.text.trim()}`),
  ].join('\n')
}

async function runCouncil(task: string, body: string): Promise<{ synthesis: string; members: MemberResult[] }> {
  const members = await Promise.all(MODELS.map(model => memberReview(model, task, body)))
  const synthesis = await synthesize(task, members)
  return { synthesis, members }
}

function formatReport(task: string, synthesis: string, members: MemberResult[]): string {
  const memberLines = members.map(m => {
    const status = m.error ? `error: ${m.error}` : `ok ${(m.durationMs / 1000).toFixed(1)}s`
    return `- ${m.model} (${m.role}): ${status}`
  }).join('\n')

  return [
    '# Ollama Council Report',
    '',
    `Task: ${task}`,
    `Ollama: ${OLLAMA_URL}`,
    `Judge: ${JUDGE_MODEL || 'none'}`,
    '',
    '## Members',
    memberLines,
    '',
    synthesis,
  ].join('\n')
}

function replaceCouncilBlock(original: string, report: string): string {
  const block = [
    '<!-- ollama-council:start -->',
    report,
    '<!-- ollama-council:end -->',
  ].join('\n')

  const re = /\n?<!-- ollama-council:start -->[\s\S]*?<!-- ollama-council:end -->\n?/m
  if (re.test(original)) return original.replace(re, `\n\n${block}\n`)
  return `${original.replace(/\s+$/u, '')}\n\n${block}\n`
}

async function probe(): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`)
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`)
  const json = await res.json() as { models?: Array<{ name?: string }> }
  const names = (json.models ?? []).map(m => m.name).filter(Boolean)
  console.log(`Ollama reachable: ${OLLAMA_URL}`)
  console.log(`Configured council: ${MODELS.join(', ')}`)
  console.log(`Installed models: ${names.join(', ')}`)
}

async function review(): Promise<void> {
  const body = await readStdin()
  if (!body.trim()) throw new Error('review mode expects stdin content')
  const result = await runCouncil('Review this GSD/autonomous workflow artifact.', body)
  console.log(formatReport('Review this GSD/autonomous workflow artifact.', result.synthesis, result.members))
}

async function bounce(planFile: string, passesRaw: string | undefined): Promise<void> {
  if (!planFile) throw new Error('bounce mode expects PLAN.md path')
  const passes = Math.max(1, Number.parseInt(passesRaw ?? '1', 10) || 1)
  let current = readFileSync(planFile, 'utf8')

  for (let pass = 1; pass <= passes; pass += 1) {
    const task = `Review and refine GSD plan ${planFile}, pass ${pass}/${passes}. Do not rewrite the plan; produce council notes to append.`
    const result = await runCouncil(task, current)
    const report = formatReport(task, result.synthesis, result.members)
    current = replaceCouncilBlock(current, report)
  }

  writeFileSync(planFile, current, 'utf8')
  console.log(`Ollama council notes written to ${planFile}`)
}

function help(): void {
  console.log(`Usage:
  npm run council -- probe
  npm run council -- review < artifact.md
  npm run council -- bounce <PLAN.md> [passes]

Env:
  OLLAMA_URL=${OLLAMA_URL}
  OLLAMA_COUNCIL_MODELS=${MODELS.join(',')}
  OLLAMA_COUNCIL_JUDGE=${JUDGE_MODEL || '(disabled)'}`)
}

async function main(): Promise<void> {
  const [mode, ...args] = process.argv.slice(2)
  switch (mode) {
    case 'probe':
      await probe()
      break
    case 'review':
      await review()
      break
    case 'bounce':
      await bounce(args[0] ?? '', args[1])
      break
    default:
      help()
      if (mode && mode !== 'help' && mode !== '--help') process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

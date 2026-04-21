import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from './logger.js'
import { writeJournal, writeLiterature, writeNote, writeTask, writeThesisFragment } from './vault-writer.js'
import { runIdeaFlow } from './idea-flow.js'
import { upsertTask } from './tasks.js'

export type CaptureType =
  | 'note'
  | 'idea'
  | 'task'
  | 'literature'
  | 'thesis_fragment'
  | 'journal'
  | 'ephemeral'

export type Classification = {
  type: CaptureType
  slug: string
  title?: string
  confidence: number
  rationale?: string
}

const CLASSIFY_TIMEOUT_MS = 30_000

const CLASSIFIER_PROMPT = `You are a classifier for a personal knowledge-base assistant. Read the user message and return EXACTLY one JSON object on a single line, no prose.

Schema:
{"type":"note|idea|task|literature|thesis_fragment|journal|ephemeral","slug":"kebab-case-3-to-6-words","title":"Title Case, 3-8 words","confidence":0.0-1.0,"rationale":"<12 words"}

Type rules:
- idea — venture/startup concept worth a full run-down report. Trigger words: "idea", "what if", "venture", "product", "startup".
- task — explicit action item or todo, possibly time-bound.
- literature — reference to academic paper, book, or article the user wants to remember.
- thesis_fragment — phrasing, data, or argument for the IS/trust-in-AI PhD thesis.
- journal — reflective diary entry or daily log.
- note — everything else worth storing.
- ephemeral — small-talk, greetings, commands without capture value. NO WRITE.

Return ONLY the JSON. Do not wrap in code fences. No explanation.`

export async function classifyCapture(text: string): Promise<Classification | null> {
  const prompt = `${CLASSIFIER_PROMPT}\n\nMessage:\n${text}`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), CLASSIFY_TIMEOUT_MS)
  timer.unref()

  const options: Options = {
    model: 'claude-sonnet-4-6',
    permissionMode: 'bypassPermissions',
    maxTurns: 2,
    settingSources: [],
    abortController: ac,
  }

  try {
    let raw = ''
    for await (const message of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
      if (message.type === 'result' && message.subtype === 'success') {
        raw = message.result
      }
    }
    return parseClassification(raw)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'classify failed')
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseClassification(raw: string): Classification | null {
  const trimmed = raw.trim()
  const match = /\{[\s\S]*\}/.exec(trimmed)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Partial<Classification>
    if (!parsed.type) return null
    if (!isType(parsed.type)) return null
    return {
      type: parsed.type,
      slug: parsed.slug ?? 'capture',
      title: parsed.title,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      rationale: parsed.rationale,
    }
  } catch {
    return null
  }
}

function isType(s: string): s is CaptureType {
  return ['note', 'idea', 'task', 'literature', 'thesis_fragment', 'journal', 'ephemeral'].includes(s)
}

export type CaptureOutcome =
  | { type: 'ephemeral'; classification: Classification }
  | { type: Exclude<CaptureType, 'ephemeral'>; classification: Classification; vaultRel: string }

export async function routeCapture(text: string, forcedType?: CaptureType): Promise<CaptureOutcome | null> {
  let classification: Classification | null
  if (forcedType) {
    classification = {
      type: forcedType,
      slug: text.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'capture',
      confidence: 1,
    }
  } else {
    classification = await classifyCapture(text)
  }
  if (!classification) return null

  const input = { text, slug: classification.slug, title: classification.title }

  switch (classification.type) {
    case 'ephemeral':
      return { type: 'ephemeral', classification }
    case 'note': {
      const { vaultRel } = await writeNote(input)
      return { type: 'note', classification, vaultRel }
    }
    case 'task': {
      const { vaultRel } = await writeTask(input)
      await upsertTask({ title: text, notes: `Captured from Telegram. Vault: ${vaultRel}` })
      return { type: 'task', classification, vaultRel }
    }
    case 'literature': {
      const { vaultRel } = await writeLiterature(input)
      return { type: 'literature', classification, vaultRel }
    }
    case 'thesis_fragment': {
      const { vaultRel } = await writeThesisFragment(input)
      return { type: 'thesis_fragment', classification, vaultRel }
    }
    case 'journal': {
      const { vaultRel } = await writeJournal(input)
      return { type: 'journal', classification, vaultRel }
    }
    case 'idea': {
      const result = await runIdeaFlow({ text, slug: classification.slug, title: classification.title })
      return { type: 'idea', classification, vaultRel: result.indexRel }
    }
  }
}

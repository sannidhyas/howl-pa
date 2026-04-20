import { listGmailUnclassified, markGmailImportance, type GmailItemRow } from './db.js'
import { logger } from './logger.js'
import { BACKENDS } from './subagent/router.js'

const PROMPT_HEADER = `You are scoring incoming email for a PhD researcher (Information Systems / trust in AI) who is also building a venture. Score each email on a 0-100 importance scale for *today's attention*.

Signals that RAISE importance: deadline, meeting confirmation or change, thesis advisor or lab correspondence, venture co-founder / investor / partner message, payment / contract / legal notice, Calendar invite, personal note from someone close, unread reply in an active thread, actionable question.

Signals that LOWER importance: newsletter / digest / mass mailing, promotional / marketing, notification from SaaS product, automated receipt without ambiguity, list you did not opt into.

Output STRICT JSON array. One object per email in the same order. Keys:
  id         - the email id I sent you
  score      - integer 0-100
  reason     - 5-12 words

NO prose, NO markdown fences. Just the JSON array.`

function buildBatchPrompt(rows: GmailItemRow[]): string {
  const entries = rows.map(r => {
    const labels = (() => {
      try {
        return r.labels ? (JSON.parse(r.labels) as string[]).join(',') : ''
      } catch {
        return r.labels ?? ''
      }
    })()
    return `- id: ${r.id}
  from: ${r.sender ?? ''}
  subject: ${r.subject ?? ''}
  labels: ${labels}
  snippet: ${(r.snippet ?? '').replace(/\s+/g, ' ').slice(0, 300)}`
  }).join('\n')
  return `${PROMPT_HEADER}\n\nEmails:\n${entries}`
}

type Scored = { id: string; score: number; reason: string }

function parseScored(text: string): Scored[] {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const first = trimmed.indexOf('[')
  const last = trimmed.lastIndexOf(']')
  if (first < 0 || last <= first) return []
  try {
    const parsed = JSON.parse(trimmed.slice(first, last + 1)) as unknown
    if (!Array.isArray(parsed)) return []
    const out: Scored[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (typeof row.id !== 'string') continue
      const score = typeof row.score === 'number' ? row.score : Number.parseInt(String(row.score ?? ''), 10)
      if (!Number.isFinite(score)) continue
      out.push({ id: row.id, score, reason: typeof row.reason === 'string' ? row.reason : '' })
    }
    return out
  } catch {
    return []
  }
}

function chooseBackendName(): string {
  const preferred = process.env.GMAIL_CLASSIFIER_BACKEND
  if (preferred && BACKENDS[preferred]) return preferred
  // Default: prefer a local Ollama model if any is registered; else Claude.
  const ollama = Object.keys(BACKENDS).find(n => n.startsWith('ollama:'))
  return ollama ?? 'claude'
}

export type ClassifyResult = {
  classified: number
  skipped: number
  batches: number
  backend: string
}

export async function classifyPendingEmails(maxBatches = 3, batchSize = 8): Promise<ClassifyResult> {
  const backendName = chooseBackendName()
  const backend = BACKENDS[backendName]
  const out: ClassifyResult = { classified: 0, skipped: 0, batches: 0, backend: backendName }
  if (!backend) return out
  for (let i = 0; i < maxBatches; i++) {
    const rows = listGmailUnclassified(batchSize)
    if (rows.length === 0) break
    out.batches += 1
    const prompt = buildBatchPrompt(rows)
    const result = await backend.run({ prompt, timeoutMs: 120_000 })
    const scored = parseScored(result.text)
    const byId = new Map(scored.map(s => [s.id, s]))
    for (const row of rows) {
      const hit = byId.get(row.id)
      if (!hit) {
        out.skipped += 1
        continue
      }
      markGmailImportance(row.id, hit.score, hit.reason)
      out.classified += 1
    }
    if (scored.length === 0) {
      logger.warn({ backend: backendName, sample: result.text.slice(0, 160) }, 'classifier returned nothing parseable')
      break
    }
  }
  logger.info(out, 'gmail classify run')
  return out
}

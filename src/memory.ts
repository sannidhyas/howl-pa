import { queryFts, type FtsHit } from './memory-fts.js'
import { queryCosineTopK, type VectorHit } from './memory-vector.js'
import { embedderHealthy } from './embedder.js'
import type { MemorySourceKind } from './db.js'

export type RecallHit = {
  kind: 'convo' | 'vault' | 'idea' | 'fragment'
  ref: string
  preview: string
  score: number
  provenance: { fts?: number; vector?: number; recency?: number }
  createdAt?: number
}

const FTS_WEIGHT = 0.3
const VEC_WEIGHT = 0.5
const RECENCY_WEIGHT = 0.2
const NOW = (): number => Date.now()

// Normalise FTS bm25 (lower = better) into [0, 1] relative to best score.
function normFts(hits: FtsHit[]): Map<number, number> {
  const out = new Map<number, number>()
  if (hits.length === 0) return out
  const best = Math.min(...hits.map(h => h.rank))
  const worst = Math.max(...hits.map(h => h.rank))
  const range = worst - best || 1
  for (const h of hits) {
    out.set(h.id, 1 - (h.rank - best) / range)
  }
  return out
}

function recencyScore(createdAt: number): number {
  const ageDays = Math.max(0, (NOW() - createdAt) / (1000 * 60 * 60 * 24))
  // Half-life ~30 days
  return Math.exp(-ageDays / 30)
}

export type RecallOpts = {
  k?: number
  chatId?: string
  kinds?: MemorySourceKind[]
}

export async function recall(query: string, opts: RecallOpts = {}): Promise<RecallHit[]> {
  const k = opts.k ?? 5
  const [ftsHits, vectorHits] = await Promise.all([
    Promise.resolve(queryFts(query, 20, opts.chatId)),
    embedderHealthy().then(ok => (ok ? queryCosineTopK(query, 20) : [] as VectorHit[])),
  ])

  const ftsNorm = normFts(ftsHits)
  const merged = new Map<string, RecallHit>()

  for (const h of ftsHits) {
    const key = `convo:${h.id}`
    const provFts = ftsNorm.get(h.id) ?? 0
    const provRecency = recencyScore(h.createdAt)
    merged.set(key, {
      kind: 'convo',
      ref: `log:${h.id}`,
      preview: `[${h.role}] ${h.content.slice(0, 240)}`,
      score: provFts * FTS_WEIGHT + provRecency * RECENCY_WEIGHT,
      provenance: { fts: provFts, recency: provRecency },
      createdAt: h.createdAt,
    })
  }

  for (const h of vectorHits) {
    const key = `${h.sourceKind}:${h.sourceRef}:${h.chunkIdx}`
    const provVector = Math.max(0, h.score)
    if (merged.has(key)) {
      const existing = merged.get(key)!
      existing.score += provVector * VEC_WEIGHT
      existing.provenance.vector = provVector
    } else {
      merged.set(key, {
        kind: h.sourceKind,
        ref: h.sourceRef,
        preview: h.chunk.slice(0, 240),
        score: provVector * VEC_WEIGHT,
        provenance: { vector: provVector },
      })
    }
  }

  const ranked = [...merged.values()].sort((a, b) => b.score - a.score)
  return ranked.slice(0, k)
}

export function formatHitsForTelegram(hits: RecallHit[]): string {
  if (hits.length === 0) return 'no hits.'
  return hits
    .map((h, i) => {
      const src = h.kind === 'convo' ? `log ${h.ref}` : `[[${h.ref}]]`
      const prov = Object.entries(h.provenance)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${(v as number).toFixed(2)}`)
        .join(', ')
      return `${i + 1}. ${src} · ${h.score.toFixed(2)} (${prov})\n${h.preview}`
    })
    .join('\n\n')
}

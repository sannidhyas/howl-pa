import type { RecallHit } from './memory.js'

const HTML_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, ch => HTML_MAP[ch] ?? ch)
}

function truncate(s: string, n: number): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  return trimmed.length <= n ? trimmed : trimmed.slice(0, n - 1).trimEnd() + '…'
}

function formatScore(n: number): string {
  return n.toFixed(2)
}

function kindBadge(kind: RecallHit['kind']): string {
  switch (kind) {
    case 'vault':
      return '📝'
    case 'convo':
      return '💬'
    case 'idea':
      return '💡'
    case 'fragment':
      return '🧩'
    default:
      return '•'
  }
}

/**
 * Returns Telegram-HTML formatted recall hits. Caller should pass
 * `parse_mode: 'HTML'` to ctx.reply. Escaping applied to all dynamic content.
 */
export function formatRecallHtml(hits: RecallHit[], query: string): string {
  if (hits.length === 0) {
    return `<b>No hits for</b> <code>${escapeHtml(query)}</code>`
  }
  const head = `<b>Recall</b> · <code>${escapeHtml(query)}</code> · <i>${hits.length} hits</i>`
  const body = hits
    .map((h, i) => {
      const refEsc = escapeHtml(h.ref)
      const scoreStr = formatScore(h.score)
      const prov = Object.entries(h.provenance)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${formatScore(v as number)}`)
        .join(' · ')
      const preview = truncate(h.preview, 220).replace(/\n+/g, ' ')
      return (
        `${kindBadge(h.kind)} <b>${i + 1}.</b> <code>${refEsc}</code>` +
        ` · <i>${scoreStr}</i>` +
        (prov ? ` <i>(${prov})</i>` : '') +
        `\n${escapeHtml(preview)}`
      )
    })
    .join('\n\n')
  return `${head}\n\n${body}`
}

export function formatMirrorResultHtml(res: {
  scanned: number
  mirrored: number
  skipped: number
  errored: number
  errors: string[]
}): string {
  const head = `<b>Thesis mirror</b> · scanned <b>${res.scanned}</b> · mirrored <b>${res.mirrored}</b> · skipped ${res.skipped} · errors ${res.errored}`
  if (res.errored === 0) return head
  const errs = res.errors
    .slice(0, 5)
    .map(e => `• <code>${escapeHtml(truncate(e, 200))}</code>`)
    .join('\n')
  return `${head}\n\n${errs}`
}

export function formatReindexResultHtml(res: {
  scanned: number
  reindexed: number
  chunksStored: number
  skipped: number
  errored: number
}): string {
  return (
    `<b>Vault reindex</b> · scanned <b>${res.scanned}</b>` +
    ` · indexed <b>${res.reindexed}</b>` +
    ` · chunks <b>${res.chunksStored}</b>` +
    ` · skipped ${res.skipped}` +
    ` · errors ${res.errored}`
  )
}

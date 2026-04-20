import { escapeHtml } from './format-telegram.js'
import {
  readDailyNote,
  parseFrontmatter,
  ensureDailyNote,
  todayIso,
  vaultRelFrom,
} from './vault.js'
import { listVaultNotes } from './memory-graph.js'
import { calendarBetween } from './calendar.js'
import { gmailSince, gmailTopByImportance } from './gmail.js'
import {
  googleAuthConfigured,
  googleTokenSaved,
} from './google-auth.js'
import { listWaAllowlist, listWaMessagesSince, type WaMessageRow } from './db.js'
import { open as openSealed } from './wa-crypto.js'
import { isWaReady } from './whatsapp.js'

export type BriefSummary = {
  html: string
  markdown: string
}

function fmtTime(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function decryptWa(row: WaMessageRow): string {
  try {
    return openSealed({
      ciphertext: Buffer.from(row.content_enc),
      iv: Buffer.from(row.content_iv),
      tag: Buffer.from(row.content_tag),
    })
  } catch {
    return '(decrypt failed)'
  }
}

export async function composeMorningBrief(): Promise<BriefSummary> {
  const date = todayIso()
  await ensureDailyNote(date)
  const raw = (await readDailyNote(date)) ?? ''
  const { frontmatter } = parseFrontmatter(raw)

  const required: string[] = []
  if (frontmatter.gym_required === 'true') required.push('gym')
  if (frontmatter.thesis_required === 'true') required.push('thesis')
  required.push('kit', 'meditation')

  const now = Date.now()
  const lastDay = now - 24 * 3600_000
  const nextDay = now + 24 * 3600_000

  // Calendar
  let calendarLines: string[]
  if (googleAuthConfigured() && googleTokenSaved()) {
    const events = calendarBetween(now - 3600_000, nextDay)
    calendarLines = events.length === 0
      ? ['<i>no events in next 24h</i>']
      : events.slice(0, 10).map(e => {
          const time = fmtTime(e.starts_at)
          const sum = escapeHtml(e.summary ?? '(no title)')
          const link = e.meet_link ? ` · <a href="${escapeHtml(e.meet_link)}">meet</a>` : ''
          return `• <b>${time}</b> ${sum}${link}`
        })
  } else {
    calendarLines = ['<i>not configured — run `npx tsx scripts/setup-google.ts`</i>']
  }

  // Gmail — ranked by LLM-scored importance, not user labels.
  let gmailLines: string[]
  if (googleAuthConfigured() && googleTokenSaved()) {
    const ranked = gmailTopByImportance(lastDay, 8)
    const items = ranked.length > 0 ? ranked : gmailSince(lastDay, 8)
    gmailLines = items.length === 0
      ? ['<i>no inbox activity in last 24h</i>']
      : items.map(m => {
          const sender = escapeHtml((m.sender ?? '').split('<')[0]?.trim() || 'unknown')
          const subj = escapeHtml(m.subject ?? '(no subject)')
          const score = m.importance !== null && m.importance !== undefined ? ` · <i>${m.importance}</i>` : ''
          const why = m.importance_reason ? ` <span class="muted">${escapeHtml(m.importance_reason)}</span>` : ''
          return `• <b>${sender}</b> — ${subj}${score}${why}`
        })
  } else {
    gmailLines = ['<i>not configured — run `npm run setup:google`</i>']
  }

  // WhatsApp
  let waLines: string[]
  if (isWaReady()) {
    const allow = listWaAllowlist()
    const allowJids = new Set(allow.map(a => a.jid))
    const rows = listWaMessagesSince(lastDay, 100).filter(r => allowJids.has(r.sender_jid ?? r.chat_jid))
    if (rows.length === 0) {
      waLines = ['<i>no overnight messages from allowlist</i>']
    } else {
      const byContact = new Map<string, number>()
      for (const r of rows) {
        const key = r.sender_name ?? r.sender_jid ?? r.chat_jid
        byContact.set(key, (byContact.get(key) ?? 0) + 1)
      }
      waLines = [...byContact.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, n]) => `• <b>${escapeHtml(name)}</b> — ${n} msg${n > 1 ? 's' : ''}`)
      // Show last message preview
      const last = rows[0]
      if (last) {
        waLines.push(`<i>latest</i>: ${escapeHtml(decryptWa(last).slice(0, 120))}`)
      }
    }
  } else {
    waLines = ['<i>not configured — run `npx tsx scripts/setup-whatsapp.ts`</i>']
  }

  // Vault
  const inboxFiles = listVaultNotes('04_Notes/inbox')
  const recentInbox = inboxFiles
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
    .map(n => vaultRelFrom(n.absPath))

  let openIdeas: string[] = []
  try {
    openIdeas = listVaultNotes('06_Projects/ideas')
      .filter(n => n.relPath.endsWith('/index.md'))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3)
      .map(n => vaultRelFrom(n.absPath))
  } catch {
    /* ignore */
  }

  const htmlLines: string[] = [
    `<b>Morning brief</b> · <code>${date}</code> · <i>${escapeHtml(frontmatter.weekday ?? '?')}</i>`,
    '',
    `<b>Required today</b>: ${required.map(escapeHtml).join(', ')}`,
    '',
    '<b>Calendar · next 24h</b>',
    ...calendarLines,
    '',
    '<b>Inbox · priority · 24h</b>',
    ...gmailLines,
    '',
    '<b>WhatsApp · allowlist · 24h</b>',
    ...waLines,
    '',
    `<b>Vault inbox (recent)</b> · ${recentInbox.length}`,
    ...recentInbox.map(p => `• <code>${escapeHtml(p)}</code>`),
  ]
  if (openIdeas.length > 0) {
    htmlLines.push('', `<b>Open ideas</b> · ${openIdeas.length}`)
    htmlLines.push(...openIdeas.map(p => `• <code>${escapeHtml(p)}</code>`))
  }
  htmlLines.push('', `<b>Daily note</b> → <code>${escapeHtml(`03_Daily/${date}.md`)}</code>`)

  const html = htmlLines.join('\n')

  const markdownLines = [
    `## Brief — ${date}`,
    '',
    `- Required: ${required.join(', ')}`,
    `- Calendar: ${calendarLines.length === 1 && calendarLines[0]?.includes('not configured') ? 'n/a' : `${calendarLines.length} items`}`,
    `- Gmail priority: ${gmailLines.length === 1 && gmailLines[0]?.includes('not configured') ? 'n/a' : `${gmailLines.length} items`}`,
    `- WhatsApp: ${waLines.length === 1 && waLines[0]?.includes('not configured') ? 'n/a' : `${waLines.length} threads`}`,
    `- Vault inbox (${recentInbox.length}):`,
    ...recentInbox.map(p => `  - [[${p}]]`),
  ]
  if (openIdeas.length > 0) {
    markdownLines.push(`- Open ideas (${openIdeas.length}):`)
    markdownLines.push(...openIdeas.map(p => `  - [[${p}]]`))
  }
  const markdown = markdownLines.join('\n')

  return { html, markdown }
}

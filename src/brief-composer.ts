import { escapeHtml } from './format-telegram.js'
import { readDailyNote, parseFrontmatter, ensureDailyNote, todayIso, vaultPath, vaultRelFrom, VAULT_SUBDIRS } from './vault.js'
import { listVaultNotes } from './memory-graph.js'

export type BriefSummary = {
  html: string
  markdown: string
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

  const inboxFiles = listVaultNotes('04_Notes/inbox')
  const recentInbox = inboxFiles
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
    .map(n => vaultRelFrom(n.absPath))

  const ideasDir = vaultPath(VAULT_SUBDIRS.projects, 'ideas')
  let openIdeas: string[] = []
  try {
    const items = listVaultNotes('06_Projects/ideas')
    openIdeas = items
      .filter(n => n.relPath.endsWith('/index.md'))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3)
      .map(n => vaultRelFrom(n.absPath))
  } catch {
    /* ignore */
  }

  const calendarLine = '<i>calendar integration lands in Phase 4 (Google OAuth pending).</i>'
  const gmailLine = '<i>gmail integration lands in Phase 4.</i>'
  const waLine = '<i>whatsapp integration lands in Phase 4.</i>'

  const htmlLines: string[] = [
    `<b>Morning brief</b> · <code>${date}</code> · <i>${escapeHtml(frontmatter.weekday ?? '?')}</i>`,
    '',
    `<b>Required today</b>: ${required.map(escapeHtml).join(', ')}`,
    '',
    '<b>Calendar</b>',
    calendarLine,
    '',
    '<b>Inbox (priority)</b>',
    gmailLine,
    '',
    '<b>WhatsApp (allowlist)</b>',
    waLine,
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
    `- Calendar/Gmail/WA integrations pending Phase 4.`,
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

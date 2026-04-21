// Structured surveys driven from scheduled missions and consumed by the
// bot text handler when a survey is active for a given chat_id.

import { appendToDailySection, parseFrontmatter, readDailyNote, serializeFrontmatter, todayIso, vaultPath, VAULT_SUBDIRS, writeDailyNote } from './vault.js'
import { simpleGit } from 'simple-git'
import { VAULT_PATH } from './config.js'
import { logger } from './logger.js'
import { clearSurvey, currentSurvey, startSurvey, advanceSurvey } from './conversation-state.js'
import { vaultRelFrom } from './vault.js'
import { escapeHtml } from './format-telegram.js'
import { listParkedIdeas } from './idea-open.js'
import { upsertTask } from './tasks.js'
import { createCalendarBlock } from './calendar.js'

const git = simpleGit(VAULT_PATH)

const MORNING_QUESTIONS = [
  {
    key: 'focus',
    prompt: '☀️ <b>Morning ritual</b> — send 1–3 lines of focus for today. I\'ll write them into <code>## Focus</code>.',
  },
  {
    key: 'thesis_artifact',
    prompt: 'What\'s today\'s one tangible <b>thesis artifact</b>? (skip with <code>skip</code>)',
  },
  {
    key: 'venture_artifact',
    prompt: 'Today\'s one tangible <b>venture artifact</b>? (skip with <code>skip</code>)',
  },
  {
    key: 'needle_tasks',
    prompt: 'What 3 things move the needle today? Send one per line. Add <code>block time</code> on a line if I should create a calendar block.',
  },
] as const

const EVENING_QUESTIONS = [
  {
    key: 'sleep_hours',
    prompt: '🌙 <b>Evening log</b> — how many hours of sleep last night? (number)',
  },
  { key: 'energy', prompt: 'Energy today 1–10?' },
  { key: 'soreness', prompt: 'Soreness today 1–10? (0 if none)' },
  { key: 'swim', prompt: 'Did you swim today? <code>y</code> / <code>n</code>' },
  { key: 'sport', prompt: 'Sport today? (name or <code>none</code>)' },
  { key: 'kit_done', prompt: 'Kit done? <code>y</code> / <code>n</code>' },
  { key: 'meditation_done', prompt: 'Meditation done? <code>y</code> / <code>n</code>' },
  { key: 'reflection', prompt: 'One sentence reflection? (<code>skip</code> to skip)' },
] as const

type Send = (html: string) => Promise<void>

function normaliseYesNo(raw: string): 'true' | 'false' | null {
  const v = raw.trim().toLowerCase()
  if (['y', 'yes', 'done', '1', 'true'].includes(v)) return 'true'
  if (['n', 'no', 'skip', 'missed', '0', 'false'].includes(v)) return 'false'
  return null
}

export async function openMorningSurvey(chatId: string, send: Send): Promise<void> {
  startSurvey({ kind: 'morning', chatId, step: 0, started: Date.now(), data: {} })
  await send(MORNING_QUESTIONS[0]!.prompt)
}

export async function openEveningSurvey(chatId: string, send: Send): Promise<void> {
  startSurvey({ kind: 'evening', chatId, step: 0, started: Date.now(), data: {} })
  await send(EVENING_QUESTIONS[0]!.prompt)
}

export async function openWeeklyReviewSurvey(chatId: string, send: Send): Promise<void> {
  const parked = listParkedIdeas(20)
  if (parked.length === 0) {
    await send('<b>Weekly review</b> · no parked ideas from this week.')
    return
  }
  startSurvey({
    kind: 'weekly-review',
    chatId,
    step: 0,
    started: Date.now(),
    data: { queue: JSON.stringify(parked.map(p => p.slug)) },
  })
  const first = parked[0]!
  await send(
    `<b>Weekly review</b> — decide each idea.\n\n1/${parked.length}: <code>${escapeHtml(first.slug)}</code>${first.title ? ` — ${escapeHtml(first.title)}` : ''}\n\nreply <code>open [new name]</code> · <code>park</code> · <code>discard</code>`
  )
}

async function commitDaily(isoDate: string, op: string): Promise<void> {
  const abs = vaultPath(VAULT_SUBDIRS.daily, `${isoDate}.md`)
  const rel = vaultRelFrom(abs)
  try {
    await git.add(rel)
    await git.commit(`[mc] daily: ${rel} ${op}`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'daily push skipped')
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'daily commit failed')
  }
}

async function applyEveningToDaily(isoDate: string, data: Record<string, string>): Promise<void> {
  const raw = (await readDailyNote(isoDate)) ?? ''
  const { frontmatter, body } = parseFrontmatter(raw)
  const fm: Record<string, string | number | boolean | string[]> = { ...frontmatter }
  if (data.sleep_hours && !Number.isNaN(Number(data.sleep_hours))) {
    fm.sleep_hours = Number(data.sleep_hours)
  }
  if (data.energy) fm.energy = data.energy
  if (data.soreness) fm.soreness = data.soreness
  if (data.swim) fm.swim = data.swim === 'true'
  if (data.sport && data.sport.toLowerCase() !== 'none') fm.sport = data.sport
  if (data.kit_done) fm.kit_done = data.kit_done === 'true'
  if (data.meditation_done) fm.meditation_done = data.meditation_done === 'true'
  const next = serializeFrontmatter(fm as Record<string, unknown>) + '\n' + (body.startsWith('\n') ? body.slice(1) : body)
  await writeDailyNote(isoDate, next)
  if (data.reflection && data.reflection.toLowerCase() !== 'skip') {
    await appendToDailySection(isoDate, 'Notes (quick capture)', `- eod: ${data.reflection}`)
  }
}

/** Called by the bot text handler when a survey is active for the chat. */
export async function handleSurveyReply(
  chatId: string,
  text: string,
  send: Send
): Promise<boolean> {
  const survey = currentSurvey(chatId)
  if (!survey) return false
  const raw = text.trim()

  if (survey.kind === 'morning') {
    const q = MORNING_QUESTIONS[survey.step]
    if (!q) {
      clearSurvey(chatId)
      return false
    }
    if (raw.toLowerCase() === 'cancel') {
      clearSurvey(chatId)
      await send('morning ritual cancelled.')
      return true
    }
    advanceSurvey(chatId, { [q.key]: raw })
    const today = todayIso()
    if (q.key === 'focus' && raw.toLowerCase() !== 'skip') {
      const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 3)
      for (const line of lines) await appendToDailySection(today, 'Focus (pick 1–3)', `- ${line}`)
    } else if (q.key === 'thesis_artifact' && raw.toLowerCase() !== 'skip') {
      await appendToDailySection(today, 'Thesis artifact (one tangible thing)', `- ${raw}`)
    } else if (q.key === 'venture_artifact' && raw.toLowerCase() !== 'skip') {
      await appendToDailySection(today, 'Venture artifact (one tangible thing)', `- ${raw}`)
    } else if (q.key === 'needle_tasks' && raw.toLowerCase() !== 'skip') {
      await createNeedleTasks(today, raw)
    }

    const next = MORNING_QUESTIONS[survey.step]
    if (next) {
      await send(next.prompt)
    } else {
      clearSurvey(chatId)
      await commitDaily(today, 'morning ritual')
      await send('✅ morning ritual logged.')
    }
    return true
  }

  if (survey.kind === 'evening') {
    const q = EVENING_QUESTIONS[survey.step]
    if (!q) {
      clearSurvey(chatId)
      return false
    }
    if (raw.toLowerCase() === 'cancel') {
      clearSurvey(chatId)
      await send('evening log cancelled.')
      return true
    }
    let value = raw
    if (['swim', 'kit_done', 'meditation_done'].includes(q.key)) {
      const yn = normaliseYesNo(raw)
      if (!yn) {
        await send('please reply <code>y</code> or <code>n</code>.')
        return true
      }
      value = yn
    } else if (['energy', 'soreness', 'sleep_hours'].includes(q.key)) {
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        await send('please send a number.')
        return true
      }
      value = String(n)
    }
    advanceSurvey(chatId, { [q.key]: value })
    const next = EVENING_QUESTIONS[survey.step]
    if (next) {
      await send(next.prompt)
    } else {
      const today = todayIso()
      await applyEveningToDaily(today, survey.data)
      await commitDaily(today, 'evening tracker')
      clearSurvey(chatId)
      await send('✅ evening log saved to daily note.')
    }
    return true
  }

  if (survey.kind === 'weekly-review') {
    if (raw.toLowerCase() === 'cancel') {
      clearSurvey(chatId)
      await send('weekly review cancelled.')
      return true
    }
    const queue: string[] = (() => {
      try {
        return JSON.parse(survey.data.queue ?? '[]') as string[]
      } catch {
        return []
      }
    })()
    const slug = queue[survey.step]
    if (!slug) {
      clearSurvey(chatId)
      await send('✅ weekly review complete.')
      return true
    }
    const [verb, ...rest] = raw.split(/\s+/)
    const name = rest.join(' ').trim() || undefined
    try {
      if (verb === 'open') {
        const { openIdea } = await import('./idea-open.js')
        const r = await openIdea(slug, name)
        await send(`opened → <code>${escapeHtml(r.projectPath)}</code>`)
      } else if (verb === 'discard') {
        const { discardIdea } = await import('./idea-open.js')
        const r = await discardIdea(slug)
        await send(`archived → <code>${escapeHtml(r.archivedPath)}</code>`)
      } else if (verb === 'park') {
        await send(`kept parked.`)
      } else {
        await send('reply with <code>open [name]</code> / <code>park</code> / <code>discard</code>.')
        return true
      }
    } catch (err) {
      await send(`⚠️ ${err instanceof Error ? err.message : String(err)}`)
    }
    advanceSurvey(chatId, { [`decision_${survey.step}`]: raw })
    const nextSlug = queue[survey.step]
    if (!nextSlug) {
      clearSurvey(chatId)
      await send('✅ weekly review complete.')
      return true
    }
    await send(`${survey.step + 1}/${queue.length}: <code>${escapeHtml(nextSlug)}</code>\n\n<code>open [name]</code> · <code>park</code> · <code>discard</code>`)
    return true
  }

  return false
}

async function createNeedleTasks(isoDate: string, raw: string): Promise<void> {
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 3)
  const due = dueAt(isoDate, 18, 0)
  for (const [idx, line] of lines.entries()) {
    const wantsBlock = /\bblock\s*time\b|\[block\]|\bblock:/i.test(line)
    const title = line
      .replace(/^\s*[-*]\s*(?:\[[ x]\]\s*)?/i, '')
      .replace(/\bblock\s*time\b|\[block\]|\bblock:/ig, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) continue
    await appendToDailySection(isoDate, 'Focus (pick 1–3)', `- [ ] ${title}`)
    await upsertTask({
      title,
      notes: `Howl PA morning needle task. Daily note: 03_Daily/${isoDate}.md`,
      due,
      importance: 80,
      importanceReason: 'morning needle task',
    })
    if (wantsBlock) {
      const start = dueAt(isoDate, 15 + idx, 0)
      const end = new Date(start.getTime() + 45 * 60_000)
      await createCalendarBlock({
        summary: `Needle: ${title}`,
        startsAt: start,
        endsAt: end,
        description: `Created from Howl PA morning ritual. Due by ${due.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}.`,
      })
    }
  }
}

function dueAt(isoDate: string, hour: number, minute: number): Date {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setHours(hour, minute, 0, 0)
  return d
}

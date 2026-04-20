import { readDailyNote, parseFrontmatter, ensureDailyNote, todayIso } from './vault.js'

type DailyFlags = {
  gym_required: boolean
  thesis_required: boolean
  gym_done: boolean
  thesis_done: boolean
  kit_done: boolean
  meditation_done: boolean
  exempt: boolean
  day_type?: string
}

function toBool(v: string | undefined): boolean {
  return v === 'true'
}

export async function todayFlags(isoDate = todayIso()): Promise<DailyFlags | null> {
  let raw = await readDailyNote(isoDate)
  if (!raw) {
    await ensureDailyNote(isoDate)
    raw = await readDailyNote(isoDate)
  }
  if (!raw) return null
  const { frontmatter } = parseFrontmatter(raw)
  return {
    gym_required: toBool(frontmatter.gym_required),
    thesis_required: toBool(frontmatter.thesis_required),
    gym_done: toBool(frontmatter.gym_done),
    thesis_done: toBool(frontmatter.thesis_done),
    kit_done: toBool(frontmatter.kit_done),
    meditation_done: toBool(frontmatter.meditation_done),
    exempt: toBool(frontmatter.exempt),
    day_type: frontmatter.day_type,
  }
}

export type NudgeItem = { flag: string; message: string }

export function computeNudges(flags: DailyFlags): NudgeItem[] {
  if (flags.exempt) return []
  const out: NudgeItem[] = []
  if (flags.gym_required && !flags.gym_done) out.push({ flag: 'gym', message: 'Gym not marked done.' })
  if (flags.thesis_required && !flags.thesis_done) out.push({ flag: 'thesis', message: 'Thesis artifact not logged today.' })
  if (!flags.kit_done) out.push({ flag: 'kit', message: 'Kit (daily practice) not marked done.' })
  if (!flags.meditation_done) out.push({ flag: 'meditation', message: 'Meditation not marked done.' })
  return out
}

export function formatNudgeHtml(items: NudgeItem[]): string {
  if (items.length === 0) return `<b>Evening check</b> · all green for today 🟢`
  const lines = items.map(i => `• <b>${i.flag}</b> — ${i.message}`).join('\n')
  return `<b>Evening check</b> · ${items.length} open\n${lines}\n\nPenalty clearing: see <code>01_System/Consequences.md</code>.`
}

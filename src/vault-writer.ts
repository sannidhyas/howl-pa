import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { VAULT_PATH } from './config.js'
import { logger } from './logger.js'
import { audit } from './db.js'
import {
  VAULT_SUBDIRS,
  appendToDailySection,
  nowStamp,
  serializeFrontmatter,
  todayIso,
  vaultPath,
  vaultRelFrom,
} from './vault.js'

const git: SimpleGit = simpleGit(VAULT_PATH)

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'capture'
}

async function bot_commit(vaultRelPath: string, op: string): Promise<void> {
  try {
    await git.add(vaultRelPath)
    await git.commit(`[mc] ${op}: ${vaultRelPath}`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: toMsg(err), vaultRelPath }, 'vault push failed — staged locally')
    }
  } catch (err) {
    logger.warn({ err: toMsg(err), vaultRelPath }, 'vault commit failed')
  }
}

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

type WriteCaptureInput = {
  text: string
  slug?: string
  source?: string
}

export type CaptureWriteResult = {
  vaultRel: string
  vaultAbs: string
  op: string
}

export async function writeNote(input: WriteCaptureInput & { title?: string }): Promise<CaptureWriteResult> {
  const stamp = nowStamp()
  const slug = slugify(input.slug ?? input.title ?? input.text.slice(0, 60))
  const vaultAbs = vaultPath(VAULT_SUBDIRS.notes, 'inbox', `${stamp}-${slug}.md`)
  const vaultRel = vaultRelFrom(vaultAbs)
  await mkdir(dirname(vaultAbs), { recursive: true })
  const content =
    serializeFrontmatter({
      created: todayIso(),
      source: input.source ?? 'telegram',
      tags: ['auto-capture', 'note'],
    }) +
    `\n\n# ${input.title ?? slug.replace(/-/g, ' ')}\n\n${input.text.trim()}\n`
  await writeFile(vaultAbs, content)
  await appendToDailySection(todayIso(), 'Notes (quick capture)', `- [[${vaultRel}|${slug}]]`)
  await bot_commit(vaultRel, 'capture-note')
  audit('capture', `note: ${vaultRel}`)
  return { vaultRel, vaultAbs, op: 'capture-note' }
}

export async function writeTask(input: WriteCaptureInput): Promise<CaptureWriteResult> {
  const vaultAbs = vaultPath(VAULT_SUBDIRS.plans, 'inbox.md')
  const vaultRel = vaultRelFrom(vaultAbs)
  await mkdir(dirname(vaultAbs), { recursive: true })
  const line = `- [ ] ${input.text.trim()} · ^${Date.now().toString(36)}`
  try {
    const { readFile } = await import('node:fs/promises')
    let body = ''
    try {
      body = await readFile(vaultAbs, 'utf8')
    } catch {
      body = `# Plans — Inbox\n\nUnassigned tasks land here; move them into 02_Plans sub-notes.\n\n`
    }
    const updated = body.trimEnd() + `\n${line}\n`
    await writeFile(vaultAbs, updated)
  } catch (err) {
    logger.warn({ err: toMsg(err) }, 'writeTask fallback')
    await writeFile(vaultAbs, line + '\n')
  }
  await bot_commit(vaultRel, 'capture-task')
  audit('capture', `task: ${vaultRel}`)
  return { vaultRel, vaultAbs, op: 'capture-task' }
}

export async function writeLiterature(input: WriteCaptureInput & { title?: string }): Promise<CaptureWriteResult> {
  const slug = slugify(input.slug ?? input.title ?? input.text.slice(0, 60))
  const vaultAbs = vaultPath(VAULT_SUBDIRS.literature, `${slug}.md`)
  const vaultRel = vaultRelFrom(vaultAbs)
  await mkdir(dirname(vaultAbs), { recursive: true })
  const content =
    serializeFrontmatter({
      created: todayIso(),
      source: input.source ?? 'telegram',
      tags: ['literature', 'auto-capture'],
    }) +
    `\n\n# ${input.title ?? slug.replace(/-/g, ' ')}\n\n## Notes\n\n${input.text.trim()}\n`
  await writeFile(vaultAbs, content)
  await appendToDailySection(todayIso(), 'Notes (quick capture)', `- lit: [[${vaultRel}|${slug}]]`)
  await bot_commit(vaultRel, 'capture-literature')
  audit('capture', `literature: ${vaultRel}`)
  return { vaultRel, vaultAbs, op: 'capture-literature' }
}

export async function writeThesisFragment(input: WriteCaptureInput): Promise<CaptureWriteResult> {
  const stamp = nowStamp()
  const slug = slugify(input.slug ?? input.text.slice(0, 60))
  const vaultAbs = vaultPath(VAULT_SUBDIRS.projects, 'thesis', 'fragments', `${stamp}-${slug}.md`)
  const vaultRel = vaultRelFrom(vaultAbs)
  await mkdir(dirname(vaultAbs), { recursive: true })
  const content =
    serializeFrontmatter({
      created: todayIso(),
      tags: ['thesis', 'fragment'],
    }) +
    `\n\n${input.text.trim()}\n`
  await writeFile(vaultAbs, content)
  await appendToDailySection(todayIso(), 'Thesis artifact (one tangible thing)', `- [[${vaultRel}|${slug}]]`)
  await bot_commit(vaultRel, 'capture-thesis-fragment')
  audit('capture', `thesis_fragment: ${vaultRel}`)
  return { vaultRel, vaultAbs, op: 'capture-thesis-fragment' }
}

export async function writeJournal(input: WriteCaptureInput): Promise<CaptureWriteResult> {
  const path = await appendToDailySection(todayIso(), 'Notes (quick capture)', `- ${input.text.trim()}`)
  const vaultRel = vaultRelFrom(path)
  await bot_commit(vaultRel, 'capture-journal')
  audit('capture', `journal: ${vaultRel}`)
  return { vaultRel, vaultAbs: path, op: 'capture-journal' }
}

export type IdeaPayload = {
  slug: string
  title: string
  rundown: string
  seed: string
  sourceText: string
}

export async function writeIdea(input: IdeaPayload): Promise<{ indexRel: string; seedRel: string }> {
  const date = todayIso()
  const dir = vaultPath(VAULT_SUBDIRS.projects, 'ideas', `${date}-${input.slug}`)
  await mkdir(dir, { recursive: true })
  const indexAbs = join(dir, 'index.md')
  const seedAbs = join(dir, 'seed.md')
  const indexRel = vaultRelFrom(indexAbs)
  const seedRel = vaultRelFrom(seedAbs)

  const indexContent =
    serializeFrontmatter({
      created: date,
      tags: ['idea', 'venture'],
      status: 'captured',
      source: 'telegram',
    }) +
    `\n\n# ${input.title}\n\n## Raw capture\n\n${input.sourceText.trim()}\n\n${input.rundown.trim()}\n`

  const seedContent =
    serializeFrontmatter({
      created: date,
      idea: input.slug,
      status: 'not-opened',
      tags: ['seed', 'automation'],
    }) +
    `\n\n${input.seed.trim()}\n`

  await writeFile(indexAbs, indexContent)
  await writeFile(seedAbs, seedContent)
  await appendToDailySection(date, 'Notes (quick capture)', `- idea: [[${indexRel}|${input.title}]]`)

  try {
    await git.add([indexRel, seedRel])
    await git.commit(`[mc] capture-idea: ${indexRel}`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: toMsg(err) }, 'idea push failed — staged locally')
    }
  } catch (err) {
    logger.warn({ err: toMsg(err) }, 'idea commit failed')
  }
  audit('capture', `idea: ${indexRel}`)
  return { indexRel, seedRel }
}

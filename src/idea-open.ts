import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { rename, readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { simpleGit } from 'simple-git'
import { VAULT_PATH } from './config.js'
import { VAULT_SUBDIRS, parseFrontmatter, serializeFrontmatter, todayIso, vaultPath, vaultRelFrom, appendToDailySection } from './vault.js'
import { logger } from './logger.js'

const git = simpleGit(VAULT_PATH)

const NUMBER_RE = /^(\d{2})_(.+)$/

function nextProjectNumber(): number {
  const root = vaultPath(VAULT_SUBDIRS.projects)
  if (!existsSync(root)) return 63
  const used = new Set<number>()
  for (const name of readdirSync(root)) {
    const full = join(root, name)
    try {
      if (!statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    const m = NUMBER_RE.exec(name)
    if (m && m[1]) {
      const n = Number.parseInt(m[1], 10)
      if (Number.isFinite(n)) used.add(n)
    }
  }
  // Project numbering observed: 61_, 62_. Start new opens at 63.
  let n = 63
  while (used.has(n)) n++
  return n
}

function pascalize(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
}

export type OpenOutcome = {
  slug: string
  pipelinePath: string
  projectPath: string
  projectNumber: number
  title: string
}

function findPipelineIdeaDir(slug: string): string | null {
  const root = vaultPath(VAULT_SUBDIRS.pipeline, 'ideas')
  if (!existsSync(root)) return null
  for (const name of readdirSync(root)) {
    if (name === slug || name.endsWith(`-${slug}`)) return join(root, name)
  }
  return null
}

async function rewriteIndexStatus(indexAbs: string, projectRel: string, projectNumber: number): Promise<string> {
  const existing = await readFile(indexAbs, 'utf8')
  const { frontmatter, body } = parseFrontmatter(existing)
  const fm: Record<string, string | string[] | number> = { ...frontmatter }
  fm.status = 'opened'
  fm.opened_at = todayIso()
  fm.project_number = projectNumber
  fm.project_path = projectRel
  const tags = (fm.tags ?? '').toString().replace('[', '').replace(']', '')
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
  if (!tagList.includes('opened')) tagList.push('opened')
  const idxParked = tagList.indexOf('parked')
  if (idxParked >= 0) tagList.splice(idxParked, 1)
  fm.tags = tagList
  return serializeFrontmatter(fm as Record<string, unknown>) + '\n\n' + body.replace(/^\s*/, '')
}

export async function openIdea(slug: string, overrideName?: string): Promise<OpenOutcome> {
  const pipelineDir = findPipelineIdeaDir(slug)
  if (!pipelineDir) throw new Error(`pipeline idea not found: ${slug}`)

  const indexPath = join(pipelineDir, 'index.md')
  if (!existsSync(indexPath)) throw new Error(`missing index.md in ${pipelineDir}`)

  const { frontmatter, body } = parseFrontmatter(await readFile(indexPath, 'utf8'))
  const titleMatch = /^#\s+(.+)$/m.exec(body)
  const rawTitle = overrideName ?? titleMatch?.[1]?.trim() ?? slug
  const pascal = pascalize(rawTitle)
  const number = nextProjectNumber()
  const projectName = `${number}_${pascal || pascalize(slug) || 'Project'}`
  const projectAbs = vaultPath(VAULT_SUBDIRS.projects, projectName)
  if (existsSync(projectAbs)) throw new Error(`target exists: ${projectAbs}`)

  await mkdir(dirname(projectAbs), { recursive: true })
  await rename(pipelineDir, projectAbs)

  const newIndexAbs = join(projectAbs, 'index.md')
  const updatedIndex = await rewriteIndexStatus(newIndexAbs, vaultRelFrom(projectAbs), number)
  await writeFile(newIndexAbs, updatedIndex)

  // Surface the new project in today's daily note.
  await appendToDailySection(
    todayIso(),
    'Venture artifact (one tangible thing)',
    `- opened [[${vaultRelFrom(newIndexAbs)}|${rawTitle}]] (${projectName})`
  )

  try {
    await git.add([vaultRelFrom(projectAbs)])
    await git.commit(`[mc] project-open: ${projectName} (from pipeline/${basename(pipelineDir)})`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'project-open push skipped')
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'project-open commit failed')
  }

  void frontmatter
  return {
    slug,
    pipelinePath: vaultRelFrom(pipelineDir),
    projectPath: vaultRelFrom(projectAbs),
    projectNumber: number,
    title: rawTitle,
  }
}

export async function discardIdea(slug: string): Promise<{ slug: string; archivedPath: string }> {
  const pipelineDir = findPipelineIdeaDir(slug)
  if (!pipelineDir) throw new Error(`pipeline idea not found: ${slug}`)
  const archiveRoot = vaultPath(VAULT_SUBDIRS.pipeline, 'archive')
  await mkdir(archiveRoot, { recursive: true })
  const destAbs = join(archiveRoot, basename(pipelineDir))
  if (existsSync(destAbs)) throw new Error(`archive target exists: ${destAbs}`)
  await rename(pipelineDir, destAbs)
  try {
    await git.add([vaultRelFrom(destAbs)])
    await git.commit(`[mc] idea-discard: ${basename(destAbs)}`)
    try {
      await git.push()
    } catch {
      /* ignore */
    }
  } catch (err) {
    logger.warn({ err }, 'idea-discard commit failed')
  }
  return { slug, archivedPath: vaultRelFrom(destAbs) }
}

export function listParkedIdeas(limit = 40): Array<{ slug: string; dir: string; mtime: number; title?: string }> {
  const root = vaultPath(VAULT_SUBDIRS.pipeline, 'ideas')
  if (!existsSync(root)) return []
  const out: Array<{ slug: string; dir: string; mtime: number; title?: string }> = []
  for (const name of readdirSync(root)) {
    const full = join(root, name)
    try {
      const s = statSync(full)
      if (!s.isDirectory()) continue
      const idx = join(full, 'index.md')
      let title: string | undefined
      try {
        if (existsSync(idx)) {
          const content = readFileSync(idx, 'utf8')
          const m = /^#\s+(.+)$/m.exec(content)
          title = m?.[1]?.trim()
        }
      } catch {
        /* ignore */
      }
      out.push({ slug: name.replace(/^\d{4}-\d{2}-\d{2}-/, ''), dir: vaultRelFrom(full), mtime: Math.floor(s.mtimeMs), title })
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

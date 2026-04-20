import { writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { simpleGit } from 'simple-git'
import { VAULT_PATH } from './config.js'
import { logger } from './logger.js'
import { extractFile, isExtractable } from './extractors/index.js'
import { getMirrorState, upsertMirrorState } from './db.js'
import { summarizeDocument } from './summarize.js'

const THESIS_ROOT = process.env.THESIS_PATH ?? `${process.env.HOME}/Documents/Thesis`
const LITERATURE_DIR = 'auto-mirror'
const MIRROR_PARENT = '04_Notes/41_Literature'

const git = simpleGit(VAULT_PATH)

export type MirrorResult = {
  scanned: number
  mirrored: number
  skipped: number
  errored: number
  errors: string[]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let s: Awaited<ReturnType<typeof stat>>
    try {
      s = await stat(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      yield* walk(full)
    } else if (s.isFile()) {
      yield full
    }
  }
}

function buildVaultNote(args: {
  summary: string
  sourceAbs: string
  mtime: number
  kind: string
  size: number
}): string {
  const today = new Date().toISOString().slice(0, 10)
  const frontmatter = [
    '---',
    `created: ${today}`,
    `source: "${args.sourceAbs}"`,
    `mtime: ${args.mtime}`,
    `kind: ${args.kind}`,
    `size: ${args.size}`,
    'tags: [auto-mirror, thesis]',
    '---',
    '',
  ].join('\n')
  const header = `# ${basename(args.sourceAbs).replace(/\.[^.]+$/, '')}\n\n*Auto-mirrored from \`${args.sourceAbs}\`*\n\n`
  return frontmatter + header + args.summary.trim() + '\n'
}

async function commitVaultFile(vaultRelPath: string, sourceRel: string): Promise<void> {
  try {
    await git.add(vaultRelPath)
    await git.commit(`[mc] thesis-mirror: ${sourceRel}`)
    // push best-effort; ignore if no remote or offline
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err }, 'thesis-mirror push failed — staged locally')
    }
  } catch (err) {
    logger.warn({ err, vaultRelPath }, 'thesis-mirror commit failed')
  }
}

export async function mirrorThesis(opts: { force?: boolean } = {}): Promise<MirrorResult> {
  const out: MirrorResult = { scanned: 0, mirrored: 0, skipped: 0, errored: 0, errors: [] }
  const mirrorDir = join(VAULT_PATH, MIRROR_PARENT, LITERATURE_DIR)
  await mkdir(mirrorDir, { recursive: true })

  for await (const abs of walk(THESIS_ROOT)) {
    out.scanned += 1
    if (!isExtractable(abs)) {
      out.skipped += 1
      continue
    }
    try {
      const s = await stat(abs)
      const mtime = Math.floor(s.mtimeMs)
      const existing = getMirrorState(abs)
      if (!opts.force && existing && existing.mtime >= mtime) {
        out.skipped += 1
        continue
      }

      const extracted = await extractFile(abs)
      if (!extracted.text || extracted.text.trim().length < 100) {
        out.skipped += 1
        logger.info({ path: abs, kind: extracted.kind }, 'thesis-mirror: too short, skipping')
        continue
      }

      const summary = await summarizeDocument(extracted.text, basename(abs))
      if (!summary || summary.length < 40) {
        out.errored += 1
        out.errors.push(`summary empty: ${abs}`)
        continue
      }

      const slug = slugify(basename(abs))
      const ext = extname(abs).slice(1) || 'unknown'
      const vaultAbs = join(mirrorDir, `${slug}-${ext}.md`)
      const vaultRel = relative(VAULT_PATH, vaultAbs).split(sep).join('/')
      const content = buildVaultNote({
        summary,
        sourceAbs: abs,
        mtime,
        kind: extracted.kind,
        size: s.size,
      })
      await writeFile(vaultAbs, content)
      upsertMirrorState({
        sourcePath: abs,
        mtime,
        vaultPath: vaultRel,
        kind: extracted.kind,
        summaryModel: 'claude-sonnet-4-6',
      })
      await commitVaultFile(vaultRel, relative(THESIS_ROOT, abs).split(sep).join('/'))
      out.mirrored += 1
      logger.info({ source: abs, vault: vaultRel }, 'thesis-mirror: wrote')
    } catch (err) {
      out.errored += 1
      const msg = err instanceof Error ? err.message : String(err)
      out.errors.push(`${abs}: ${msg}`)
      logger.warn({ err, path: abs }, 'thesis-mirror: error')
    }
  }

  logger.info(out, 'thesis-mirror done')
  return out
}

import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { simpleGit } from 'simple-git'
import { VAULT_PATH } from './config.js'
import { logger } from './logger.js'
import { extractFile, isExtractable } from './extractors/index.js'
import { getMirrorState, upsertMirrorState } from './db.js'
import { summarizeDocument } from './summarize.js'
import { inferCitekey, literaturePathFor } from './citekey.js'

const THESIS_ROOT = process.env.THESIS_PATH ?? `${process.env.HOME}/Documents/Thesis`
const CALLOUT_HEADER = '> [!howl-summary]'

const git = simpleGit(VAULT_PATH)

export type MirrorResult = {
  scanned: number
  created: number
  updated: number
  skipped: number
  errored: number
  errors: string[]
}

function citekeyFromText(filename: string, text: string): string | null {
  const ck = inferCitekey(filename, text.slice(0, 1200))
  return ck
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
    if (s.isDirectory()) yield* walk(full)
    else if (s.isFile()) yield full
  }
}

function buildStub(citekey: string, filename: string, callout: string): string {
  const title = basename(filename).replace(/\.[^.]+$/, '')
  return [
    '---',
    'category: literaturenote',
    'tags: [ZotLit, auto, needs-zotero]',
    `citekey: ${citekey}`,
    'status: unread',
    'dateread:',
    '---',
    '',
    '> [!Citation]',
    `> ${title}`,
    '',
    '> [!Synthesis]',
    '> **Contribution**:: ',
    '>',
    '> **Data**:: ',
    '>',
    '> **Methodology**:: ',
    '>',
    '> **Related**:: ',
    '',
    '> [!LINK]',
    `>  [PDF](file://${filename.replace(/ /g, '%20')})`,
    '',
    callout,
    '',
    '# Notes',
    '',
    '',
  ].join('\n')
}

function insertOrReplaceCallout(existing: string, callout: string): { updated: string; mode: 'insert' | 'replace' | 'noop' } {
  // Already present? Replace the block (everything starting `> [!howl-summary]`
  // up to the next blank non-callout line or the next `# ` header).
  const marker = CALLOUT_HEADER
  const idx = existing.indexOf(marker)
  if (idx >= 0) {
    // Find end: scan forward line by line until a line that is neither a
    // callout line nor a blank line-between-callout-paragraphs within the same block.
    const lines = existing.slice(idx).split(/\r?\n/)
    let endLine = lines.length
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line === '' || line.startsWith('> ') || line.startsWith('>')) continue
      endLine = i
      break
    }
    const blockLen = lines.slice(0, endLine).join('\n').length
    const before = existing.slice(0, idx)
    const after = existing.slice(idx + blockLen)
    const replaced = `${before}${callout}${after.startsWith('\n') ? '' : '\n'}${after}`
    return { updated: replaced, mode: 'replace' }
  }

  // Insert before `# Notes` or `# Annotations`, else at end.
  const anchorIdx = (() => {
    for (const heading of ['\n# Notes', '\n# Annotations']) {
      const p = existing.indexOf(heading)
      if (p >= 0) return p + 1 // position of the `#`
    }
    return -1
  })()

  if (anchorIdx >= 0) {
    const before = existing.slice(0, anchorIdx)
    const after = existing.slice(anchorIdx)
    const sep = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    return { updated: `${before}${sep}${callout}\n\n${after}`, mode: 'insert' }
  }

  // No anchor — append.
  const suffix = existing.endsWith('\n') ? '' : '\n'
  return { updated: `${existing}${suffix}\n${callout}\n`, mode: 'insert' }
}

async function commitVaultFile(vaultRelPath: string, op: 'created' | 'updated'): Promise<void> {
  try {
    await git.add(vaultRelPath)
    await git.commit(`[mc] thesis-${op}: ${vaultRelPath}`)
    try {
      await git.push()
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err, vaultRelPath }, 'thesis-mirror push skipped')
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err, vaultRelPath }, 'thesis-mirror commit failed')
  }
}

export async function mirrorThesis(opts: { force?: boolean } = {}): Promise<MirrorResult> {
  const out: MirrorResult = { scanned: 0, created: 0, updated: 0, skipped: 0, errored: 0, errors: [] }

  for await (const abs of walk(THESIS_ROOT)) {
    out.scanned += 1
    if (!isExtractable(abs)) {
      out.skipped += 1
      continue
    }
    try {
      const s = await stat(abs)
      const mtime = Math.floor(s.mtimeMs)
      const existingState = getMirrorState(abs)
      if (!opts.force && existingState && existingState.mtime >= mtime) {
        out.skipped += 1
        continue
      }

      const extracted = await extractFile(abs)
      if (!extracted.text || extracted.text.trim().length < 120) {
        out.skipped += 1
        continue
      }

      const citekey = citekeyFromText(abs, extracted.text)
      if (!citekey) {
        out.skipped += 1
        logger.info({ path: abs }, 'thesis-mirror: could not infer citekey, skipping')
        continue
      }

      const vaultRel = literaturePathFor(citekey)
      const vaultAbs = join(VAULT_PATH, vaultRel)
      const callout = await summarizeDocument(extracted.text, basename(abs))
      if (!callout || callout.length < 40) {
        out.errored += 1
        out.errors.push(`summary empty: ${abs}`)
        continue
      }

      if (existsSync(vaultAbs)) {
        const existing = await readFile(vaultAbs, 'utf8')
        const { updated, mode } = insertOrReplaceCallout(existing, callout)
        if (mode === 'noop' || updated === existing) {
          out.skipped += 1
          continue
        }
        await writeFile(vaultAbs, updated)
        upsertMirrorState({ sourcePath: abs, mtime, vaultPath: vaultRel, kind: extracted.kind, summaryModel: 'claude-sonnet-4-6' })
        await commitVaultFile(vaultRel, 'updated')
        out.updated += 1
      } else {
        await mkdir(join(VAULT_PATH, '04_Notes', '41_Literature'), { recursive: true })
        await writeFile(vaultAbs, buildStub(citekey, abs, callout))
        upsertMirrorState({ sourcePath: abs, mtime, vaultPath: vaultRel, kind: extracted.kind, summaryModel: 'claude-sonnet-4-6' })
        await commitVaultFile(vaultRel, 'created')
        out.created += 1
      }
    } catch (err) {
      out.errored += 1
      const msg = err instanceof Error ? err.message : String(err)
      out.errors.push(`${abs}: ${msg}`)
      logger.warn({ err: err instanceof Error ? err.message : err, path: abs }, 'thesis-mirror: error')
    }
  }

  logger.info(out, 'thesis-mirror done')
  return out
}

// Needed because we reworked the return shape.
export function describeMirrorResult(result: MirrorResult): string {
  return `scanned=${result.scanned} created=${result.created} updated=${result.updated} skipped=${result.skipped} errors=${result.errored}`
}
// Re-export relative helper for the formatter.
export { relative as _relativeForFormatter, sep as _sepForFormatter }

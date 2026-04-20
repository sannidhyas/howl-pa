import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { VAULT_PATH } from './config.js'

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
const TAG_RE = /(?:^|\s)#([A-Za-z0-9/_\-]+)/g
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/

export type VaultNote = {
  absPath: string
  relPath: string
  name: string
  mtime: number
  size: number
}

export type NoteLinks = {
  path: string
  outLinks: string[]
  tags: string[]
  frontmatter: Record<string, string>
}

export function listVaultNotes(subdir?: string): VaultNote[] {
  const root = subdir ? join(VAULT_PATH, subdir) : VAULT_PATH
  const out: VaultNote[] = []
  walk(root)
  return out

  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      if (name === 'node_modules' || name === 'Attachments' || name === '411_Attachments') continue
      const full = join(dir, name)
      let stats: ReturnType<typeof statSync>
      try {
        stats = statSync(full)
      } catch {
        continue
      }
      if (stats.isDirectory()) {
        walk(full)
      } else if (stats.isFile() && name.toLowerCase().endsWith('.md')) {
        out.push({
          absPath: full,
          relPath: relative(VAULT_PATH, full).split(sep).join('/'),
          name: name.replace(/\.md$/i, ''),
          mtime: Math.floor(stats.mtimeMs),
          size: stats.size,
        })
      }
    }
  }
}

export function parseNote(absPath: string): NoteLinks {
  const text = readFileSync(absPath, 'utf8')
  const relPath = relative(VAULT_PATH, absPath).split(sep).join('/')

  const frontmatter: Record<string, string> = {}
  const fm = FRONTMATTER_RE.exec(text)
  if (fm && fm[1]) {
    for (const raw of fm[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw)
      if (m && m[1] && m[2] !== undefined) frontmatter[m[1]] = m[2].trim()
    }
  }
  const body = fm ? text.slice(fm[0].length) : text

  const outLinks = new Set<string>()
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    const target = m[1]?.trim()
    if (target) outLinks.add(target)
  }

  const tags = new Set<string>()
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(body)) !== null) {
    const tag = m[1]?.trim()
    if (tag) tags.add(tag)
  }

  return {
    path: relPath,
    outLinks: [...outLinks],
    tags: [...tags],
    frontmatter,
  }
}

export function findBacklinksFor(noteName: string): string[] {
  const notes = listVaultNotes()
  const back: string[] = []
  for (const n of notes) {
    const links = parseNote(n.absPath).outLinks
    if (links.some(l => l === noteName || l.endsWith(`/${noteName}`))) {
      back.push(n.relPath)
    }
  }
  return back
}

export function readNoteBody(absPath: string): { frontmatter: Record<string, string>; body: string } {
  const text = readFileSync(absPath, 'utf8')
  const fm = FRONTMATTER_RE.exec(text)
  const frontmatter: Record<string, string> = {}
  if (fm && fm[1]) {
    for (const raw of fm[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw)
      if (m && m[1] && m[2] !== undefined) frontmatter[m[1]] = m[2].trim()
    }
  }
  const body = fm ? text.slice(fm[0].length) : text
  return { frontmatter, body }
}

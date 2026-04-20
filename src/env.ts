import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue
    const m = LINE_RE.exec(raw)
    if (!m || !m[1]) continue
    let value = m[2] ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

export function expandPath(p: string | undefined): string | undefined {
  if (!p) return p
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  if (p === '~') return homedir()
  return p
}

type LoadOptions = {
  projectDir: string
  configDir?: string
}

// Load order (later wins for present keys): shell env -> project .env -> config dir .env.
// Shell env wins because it's how operators inject secrets in CI/systemd.
export function loadEnv(opts: LoadOptions): Record<string, string> {
  const merged: Record<string, string> = {}

  const configDir = expandPath(opts.configDir ?? process.env.CLAUDECLAW_CONFIG ?? '~/.claudeclaw')
  const configEnvPath = configDir ? join(configDir, '.env') : undefined
  const projectEnvPath = join(opts.projectDir, '.env')

  for (const path of [configEnvPath, projectEnvPath]) {
    if (!path || !existsSync(path)) continue
    try {
      Object.assign(merged, parseEnvText(readFileSync(path, 'utf8')))
    } catch {
      // missing or unreadable file — skip silently, config.ts will error on required keys
    }
  }

  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) merged[k] = v
  }

  return merged
}

export function projectRootFrom(importMetaUrl: string): string {
  // src/env.ts -> project root is one dir up.
  const filePath = new URL(importMetaUrl).pathname
  return resolve(filePath, '..', '..')
}

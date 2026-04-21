import { expandPath, loadEnv, projectRootFrom, resolveConfigDir } from './env.js'
import { join } from 'node:path'

export const PROJECT_ROOT = projectRootFrom(import.meta.url)

const raw = loadEnv({ projectDir: PROJECT_ROOT })

// Mirror the merged env into process.env so libraries that read directly
// (googleapis OAuth, baileys, etc.) see the same values without each
// module needing to re-implement .env parsing.
for (const [k, v] of Object.entries(raw)) {
  if (process.env[k] === undefined) process.env[k] = v
}

export const rawEnv: Readonly<Record<string, string>> = raw

function required(key: string): string {
  const v = raw[key]
  if (v === undefined || v === '') {
    throw new Error(`missing required env var: ${key}`)
  }
  return v
}

function optional(key: string, fallback = ''): string {
  return raw[key] ?? fallback
}

function intOpt(key: string, fallback: number): number {
  const v = raw[key]
  if (v === undefined || v === '') return fallback
  const n = Number.parseInt(v, 10)
  if (Number.isNaN(n)) throw new Error(`env ${key} must be integer; got ${v}`)
  return n
}

function bool(key: string, fallback: boolean): boolean {
  const v = raw[key]?.toLowerCase()
  if (v === undefined || v === '') return fallback
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function enumOpt<T extends string>(key: string, values: readonly T[], fallback: T): T {
  const v = raw[key] as T | undefined
  if (!v) return fallback
  if (!values.includes(v)) throw new Error(`env ${key} must be one of ${values.join('|')}; got ${v}`)
  return v
}

// Core — required for bot to start
export const TELEGRAM_BOT_TOKEN = required('TELEGRAM_BOT_TOKEN')
export const ALLOWED_CHAT_ID = required('ALLOWED_CHAT_ID')
export const CLAUDE_CODE_OAUTH_TOKEN = required('CLAUDE_CODE_OAUTH_TOKEN')

// Agent behaviour
export const AGENT_TIMEOUT_MS = intOpt('AGENT_TIMEOUT_MS', 900_000)
export const AGENT_MAX_TURNS = intOpt('AGENT_MAX_TURNS', 30)
export const SHOW_COST_FOOTER = enumOpt(
  'SHOW_COST_FOOTER',
  ['compact', 'verbose', 'cost', 'full', 'off'] as const,
  'compact'
)

// Security — optional; absent PIN_HASH means security layer is in "unlocked" mode until user runs setup
export const PIN_HASH = optional('PIN_HASH')
export const PIN_SALT = optional('PIN_SALT')
export const IDLE_LOCK_MINUTES = intOpt('IDLE_LOCK_MINUTES', 30)
export const KILL_PHRASE = optional('KILL_PHRASE')

// Paths — single source of truth lives in src/env.ts (resolveConfigDir).
export const CLAUDECLAW_CONFIG = resolveConfigDir()
export const VAULT_PATH =
  expandPath(optional('VAULT_PATH', '~/Documents/vault')) ?? '~/Documents/vault'
export const STORE_DIR = join(CLAUDECLAW_CONFIG, 'store')
export const DB_PATH = join(STORE_DIR, 'howl.db')
export const LOCK_PATH = join(STORE_DIR, 'claudeclaw.pid')

// Observability
export const LOG_LEVEL = optional('LOG_LEVEL', 'info')
export const NODE_ENV = optional('NODE_ENV', 'development')
export const IS_DEV = NODE_ENV !== 'production'

// Subagent router hints that force Claude instead of Codex
export const CLAUDE_HINTS = ['ui', 'ux', 'design', 'visual', 'layout', 'css', 'mockup'] as const

// Explicit export for feature toggles that ride on env presence
export const SECURITY_ENABLED = PIN_HASH !== '' && PIN_SALT !== ''

export const DEBUG_ACKNOWLEDGE = bool('DEBUG_ACKNOWLEDGE', false)

// Multi-bot fanout — scans env for TELEGRAM_BOT_TOKEN_<AGENT_ID>=... pairs.
// Agent IDs are lowercased during routing.
export type AgentBotToken = { agentId: string; token: string }

export function discoverAgentBotTokens(): AgentBotToken[] {
  const out: AgentBotToken[] = []
  const prefix = 'TELEGRAM_BOT_TOKEN_'
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith(prefix) || !v) continue
    const id = k.slice(prefix.length).toLowerCase()
    if (!/^[a-z0-9_-]{2,30}$/.test(id)) continue
    out.push({ agentId: id, token: v })
  }
  return out
}

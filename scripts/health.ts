import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import {
  AGENT_TIMEOUT_MS,
  CLAUDECLAW_CONFIG,
  DB_PATH,
  PROJECT_ROOT,
  VAULT_PATH,
  rawEnv,
} from '../src/config.js'
import { closeDatabase, getDb, initDatabase } from '../src/db.js'
import { googleAuthConfigured, googleTokenSaved } from '../src/google-auth.js'
import { isTasksReady } from '../src/tasks.js'

type Status = 'ok' | 'warn' | 'fail'
type Check = { name: string; status: Status; detail: string }

const checks: Check[] = []

function add(name: string, status: Status, detail: string): void {
  checks.push({ name, status, detail })
}

function envSet(key: string): boolean {
  return Boolean(rawEnv[key])
}

function gitSummary(path: string): string {
  const res = spawnSync('git', ['status', '--short'], { cwd: path, encoding: 'utf8' })
  if (res.status !== 0) return `git status failed: ${(res.stderr || res.stdout).trim()}`
  const lines = res.stdout.trim().split(/\r?\n/).filter(Boolean)
  return lines.length === 0 ? 'clean' : `${lines.length} dirty entries`
}

async function checkOllama(): Promise<void> {
  const url = rawEnv.OLLAMA_URL || 'http://localhost:11434'
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2_000) })
    if (!res.ok) {
      add('ollama', 'warn', `HTTP ${res.status} at ${url}`)
      return
    }
    const json = (await res.json()) as { models?: Array<{ name?: string }> }
    const models = (json.models ?? []).map(m => m.name).filter(Boolean)
    add('ollama', 'ok', models.length > 0 ? models.join(', ') : 'reachable; no models listed')
  } catch (err) {
    add('ollama', 'warn', `${url} unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function checkNode(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  add('node', major >= 22 ? 'ok' : 'fail', process.version)
}

function checkFiles(): void {
  // In source mode PROJECT_ROOT is the repo and entry lives at dist/src/index.js.
  // In installed mode PROJECT_ROOT is already the dist/ dir so entry is src/index.js.
  const installedEntry = join(PROJECT_ROOT, 'src', 'index.js')
  const sourceEntry = join(PROJECT_ROOT, 'dist', 'src', 'index.js')
  const entry = existsSync(installedEntry) ? installedEntry : sourceEntry
  add('dist', existsSync(entry) ? 'ok' : 'fail', existsSync(entry) ? entry : `missing ${sourceEntry}`)

  const market = join(PROJECT_ROOT, '.agents', 'plugins', 'marketplace.json')
  const caveman = join(PROJECT_ROOT, 'vendor', 'caveman', 'plugins', 'caveman', '.codex-plugin', 'plugin.json')
  add('plugin marketplace', existsSync(market) ? 'ok' : 'warn', existsSync(market) ? market : 'missing')
  add('caveman plugin', existsSync(caveman) ? 'ok' : 'warn', existsSync(caveman) ? caveman : 'missing')
}

function checkEnv(): void {
  const required = ['TELEGRAM_BOT_TOKEN', 'ALLOWED_CHAT_ID', 'CLAUDE_CODE_OAUTH_TOKEN']
  const missing = required.filter(k => !envSet(k))
  add('core env', missing.length === 0 ? 'ok' : 'fail', missing.length === 0 ? 'required keys set' : `missing ${missing.join(', ')}`)
  add('security env', envSet('PIN_HASH') && envSet('PIN_SALT') && envSet('KILL_PHRASE') ? 'ok' : 'warn', 'PIN/KILL configured check')
  add('dashboard env', envSet('DASHBOARD_TOKEN') ? 'ok' : 'warn', envSet('DASHBOARD_TOKEN') ? 'token set' : 'token missing')
  add('config dir', existsSync(CLAUDECLAW_CONFIG) ? 'ok' : 'warn', CLAUDECLAW_CONFIG)
}

function checkDb(): void {
  initDatabase()
  const db = getDb()
  const tableCount = (db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`).get() as { n: number }).n
  add('database', tableCount > 0 ? 'ok' : 'fail', `${DB_PATH}; ${tableCount} tables`)

  const running = db.prepare(
    `SELECT name, last_run FROM scheduled_tasks WHERE status='running' ORDER BY name`
  ).all() as Array<{ name: string; last_run: number | null }>
  const stale = running.filter(r => !r.last_run || Date.now() - r.last_run > AGENT_TIMEOUT_MS)
  add(
    'scheduler running',
    stale.length > 0 ? 'fail' : running.length > 0 ? 'warn' : 'ok',
    stale.length > 0 ? `stale: ${stale.map(r => r.name).join(', ')}` : `${running.length} running`
  )

  const tasks = db.prepare(
    `SELECT status, COUNT(*) AS n FROM scheduled_tasks GROUP BY status ORDER BY status`
  ).all() as Array<{ status: string; n: number }>
  add('scheduled tasks', 'ok', tasks.map(t => `${t.status}:${t.n}`).join(', ') || 'none')

  const chunks = (db.prepare(`SELECT COUNT(*) AS n FROM memory_chunks`).get() as { n: number }).n
  add('memory chunks', chunks > 0 ? 'ok' : 'warn', String(chunks))
}

function checkIntegrations(): void {
  add('google oauth', googleAuthConfigured() && googleTokenSaved() ? 'ok' : 'warn', `configured=${googleAuthConfigured()} token=${googleTokenSaved()}`)
  add('google tasks', isTasksReady() ? 'ok' : 'warn', isTasksReady() ? 'ready' : 'not configured')
}

function checkVault(): void {
  if (!existsSync(VAULT_PATH)) {
    add('vault', 'fail', `${VAULT_PATH} missing`)
    return
  }
  const s = statSync(VAULT_PATH)
  add('vault', s.isDirectory() ? 'ok' : 'fail', VAULT_PATH)
  const status = gitSummary(VAULT_PATH)
  add('vault git', status === 'clean' ? 'ok' : 'warn', status)
}

function print(): void {
  for (const c of checks) {
    const mark = c.status === 'ok' ? 'OK' : c.status === 'warn' ? 'WARN' : 'FAIL'
    console.log(`${mark.padEnd(4)} ${c.name.padEnd(20)} ${c.detail}`)
  }
}

async function main(): Promise<void> {
  checkNode()
  checkFiles()
  checkEnv()
  checkDb()
  checkIntegrations()
  checkVault()
  await checkOllama()
  print()
  closeDatabase()
  if (checks.some(c => c.status === 'fail')) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

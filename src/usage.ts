import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type Hono, type Context } from 'hono'

type UsageCache = { ts: number; data: unknown }
type Rollup = { prompts: number; sessions: number; hours: number }
type StatsFile = { user: string; updated: string; today: Rollup; week: Rollup }
type ClaudeAvailable = {
  available: true
  note: string
  total_prompts: number
  total_sessions: number
  total_hours: number
  users: string[]
  daily: unknown[]
}
type Unavailable = { available: false; reason: string }
type UsageResponse = {
  ok: true
  window_hours: number
  claude: ClaudeAvailable | Unavailable
  codex: Unavailable
}

let cache: UsageCache | null = null
const CACHE_TTL_MS = 30_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number {
  const value: unknown = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readRollup(value: unknown): Rollup {
  if (!isRecord(value)) return { prompts: 0, sessions: 0, hours: 0 }
  return {
    prompts: readFiniteNumber(value, 'prompts'),
    sessions: readFiniteNumber(value, 'sessions'),
    hours: readFiniteNumber(value, 'hours'),
  }
}

function parseStats(value: unknown): StatsFile | null {
  if (!isRecord(value)) return null
  const user: unknown = value.user
  const updated: unknown = value.updated
  if (typeof user !== 'string' || typeof updated !== 'string') return null
  return {
    user,
    updated,
    today: readRollup(value.today),
    week: readRollup(value.week),
  }
}

function parseWindowHours(value: string | undefined): number {
  if (!value) return 168
  const parsed: number = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 168
  return parsed
}

function unavailableResponse(windowHours: number): UsageResponse {
  return {
    ok: true,
    window_hours: windowHours,
    claude: {
      available: false,
      reason: 'claude-shared-usage-tracker not configured — run /usage-install in Claude Code',
    },
    codex: {
      available: false,
      reason: 'claude-shared-usage-tracker not configured',
    },
  }
}

function cachedResponseFor(windowHours: number): UsageResponse | null {
  if (!cache || Date.now() - cache.ts >= CACHE_TTL_MS) return null
  if (!isRecord(cache.data) || cache.data.window_hours !== windowHours) return null
  return cache.data as UsageResponse
}

async function readSyncDir(): Promise<string | null> {
  const configPath: string = path.join(os.homedir(), '.claude', 'usage', 'config.json')
  if (!existsSync(configPath)) return null

  try {
    const raw: string = await readFile(configPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const syncDir: unknown = parsed.sync_dir
    return typeof syncDir === 'string' && syncDir.trim() ? syncDir : null
  } catch (_e: unknown) {
    return null
  }
}

async function readStatsFile(filePath: string): Promise<StatsFile | null> {
  try {
    const raw: string = await readFile(filePath, 'utf8')
    return parseStats(JSON.parse(raw) as unknown)
  } catch (_e: unknown) {
    return null
  }
}

async function buildUsage(windowHours: number): Promise<UsageResponse> {
  const syncDir: string | null = await readSyncDir()
  if (!syncDir) return unavailableResponse(windowHours)

  let names: string[] = []
  try {
    names = (await readdir(syncDir)).filter((name: string) => name.endsWith('_stats.json')).slice(0, 100)
  } catch (_e: unknown) {
    names = []
  }

  const windowStart: Date = new Date(Date.now() - windowHours * 3600 * 1000)
  const useWeek: boolean = windowHours >= 168
  const users: Set<string> = new Set<string>()
  let totalPrompts: number = 0
  let totalSessions: number = 0
  let totalHours: number = 0

  for (const name of names) {
    const stats: StatsFile | null = await readStatsFile(path.join(syncDir, name))
    if (!stats) continue

    const updatedMs: number = Date.parse(stats.updated)
    if (!Number.isFinite(updatedMs) || updatedMs < windowStart.getTime()) continue

    const rollup: Rollup = useWeek ? stats.week : stats.today
    totalPrompts += rollup.prompts
    totalSessions += rollup.sessions
    totalHours += rollup.hours
    users.add(stats.user)
  }

  return {
    ok: true,
    window_hours: windowHours,
    claude: {
      available: true,
      note: 'claude-shared-usage-tracker records prompts/sessions/hours — no per-token breakdown available',
      total_prompts: totalPrompts,
      total_sessions: totalSessions,
      total_hours: totalHours,
      users: Array.from(users).sort(),
      daily: [],
    },
    codex: {
      available: false,
      reason: 'Codex CLI does not write token logs to disk — no local usage data found',
    },
  }
}

export function registerUsageRoute(
  app: Hono,
  auth: (c: Context) => Response | null
): void {
  app.get('/api/usage', async (c: Context): Promise<Response> => {
    const gate: Response | null = auth(c)
    if (gate) return gate

    const windowHours: number = parseWindowHours(c.req.query('window_hours'))
    const cached: UsageResponse | null = cachedResponseFor(windowHours)
    if (cached) return c.json(cached)

    let data: UsageResponse
    try {
      data = await buildUsage(windowHours)
    } catch (_e: unknown) {
      data = unavailableResponse(windowHours)
    }
    cache = { ts: Date.now(), data }
    return c.json(data)
  })
}

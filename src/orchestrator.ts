import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { loadAgentConfig, resolveAgentClaudeMd } from './agent-config.js'
import { dispatchSubagent } from './subagent/router.js'
import { enqueueMission, updateMissionTaskStatus, audit, getDb } from './db.js'
import { logger } from './logger.js'

export type Delegation = {
  agentId: string
  prompt: string
}

export function parseDelegation(text: string): Delegation | null {
  const m = /^@([a-z0-9_-]{2,40}):\s*([\s\S]+)/i.exec(text.trim())
  if (!m || !m[1] || !m[2]) return null
  return { agentId: m[1].toLowerCase(), prompt: m[2].trim() }
}

export function agentExists(agentId: string): boolean {
  if (agentId === 'main') return true
  try {
    loadAgentConfig(agentId)
    return true
  } catch {
    return false
  }
}

async function loadAgentPersona(agentId: string): Promise<string> {
  const claudePath = resolveAgentClaudeMd(agentId)
  if (!claudePath || !existsSync(claudePath)) return ''
  try {
    return (await readFile(claudePath, 'utf8')).trim()
  } catch {
    return ''
  }
}

export type DelegationOutcome = {
  agentId: string
  ok: boolean
  text: string
  backend?: string
  durationMs: number
  missionId: number
  error?: string
}

export async function routeDelegation(d: Delegation, chatId: string): Promise<DelegationOutcome> {
  const missionId = enqueueMission({
    title: `@${d.agentId}: ${d.prompt.slice(0, 80)}`,
    prompt: d.prompt,
    mission: 'delegation',
    assignedAgent: d.agentId,
  })
  audit('delegation', `${d.agentId} ← ${d.prompt.slice(0, 120)}`, { chatId, agentId: d.agentId })
  updateMissionTaskStatus(missionId, 'running')

  if (!agentExists(d.agentId)) {
    updateMissionTaskStatus(missionId, 'failed', `unknown agent: ${d.agentId}`)
    return {
      agentId: d.agentId,
      ok: false,
      text: `Agent \`${d.agentId}\` is not registered. Create with \`howl agent:create ${d.agentId}\`.`,
      durationMs: 0,
      missionId,
      error: 'unknown-agent',
    }
  }

  const persona = await loadAgentPersona(d.agentId)
  const header = persona
    ? `You are agent \`${d.agentId}\`. Your role is defined below.\n\n${persona}\n\n---\n\n`
    : `You are agent \`${d.agentId}\`.\n\n`

  const start = Date.now()
  const outcome = await dispatchSubagent(
    { prompt: header + d.prompt, chatId, hints: [] },
    { mode: 'single' }
  )
  const duration = Date.now() - start

  // hive_mind — log every cross-agent interaction so other agents can see recent activity.
  try {
    getDb()
      .prepare(
        `INSERT INTO hive_mind (agent_id, chat_id, action, summary, artifacts)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`
      )
      .run(
        d.agentId,
        chatId,
        'delegation',
        d.prompt.slice(0, 240),
        outcome.final.slice(0, 600)
      )
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'hive_mind insert failed')
  }

  updateMissionTaskStatus(missionId, 'done', outcome.final.slice(0, 800))

  return {
    agentId: d.agentId,
    ok: true,
    text: outcome.final,
    backend: outcome.backendsUsed[0],
    durationMs: duration,
    missionId,
  }
}

// Ensure hive_mind schema exists — not declared in the baseline db.ts yet.
// Inline guard so the first delegation doesn't fail with "no such table".
export function ensureHiveMindSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS hive_mind (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      chat_id TEXT,
      action TEXT NOT NULL,
      summary TEXT,
      artifacts TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_hive_agent_ts ON hive_mind(agent_id, created_at DESC);
  `)
}

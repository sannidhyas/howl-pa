import { Hono, type Context } from 'hono'
import { serve, type ServerType } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import { timingSafeEqual as tseq } from 'node:crypto'
import { getDb } from './db.js'
import { logger } from './logger.js'
import { chatEvents, type ChatEventPayload } from './state.js'
import { dashboardHtml } from './dashboard-html.js'

const DEFAULT_PORT = Number.parseInt(process.env.DASHBOARD_PORT ?? '3141', 10)

function resolveToken(): string {
  return process.env.DASHBOARD_TOKEN ?? ''
}

function verifyToken(token: string | undefined): boolean {
  const expected = resolveToken()
  if (!expected) return false
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return tseq(a, b)
  } catch {
    return false
  }
}

function requireToken(c: Context): Response | null {
  const token = c.req.query('token') ?? c.req.header('x-dashboard-token')
  if (!verifyToken(token)) {
    return new Response('unauthorized', { status: 401 })
  }
  return null
}

type Row = Record<string, unknown>

function rows(sql: string, ...args: unknown[]): Row[] {
  return getDb()
    .prepare(sql)
    .all(...(args as never[])) as Row[]
}

function one<T>(sql: string, ...args: unknown[]): T | undefined {
  return getDb()
    .prepare(sql)
    .get(...(args as never[])) as T | undefined
}

function buildApp(): Hono {
  const app = new Hono()

  app.get('/', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.html(dashboardHtml(resolveToken()))
  })

  app.get('/api/health', c => {
    const gate = requireToken(c)
    if (gate) return gate
    const convo = one<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_log')
    const chunks = one<{ n: number }>('SELECT COUNT(*) AS n FROM memory_chunks')
    const audit = one<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')
    return c.json({
      ok: true,
      uptime_s: Math.floor(process.uptime()),
      pid: process.pid,
      convo_rows: convo?.n ?? 0,
      memory_chunks: chunks?.n ?? 0,
      audit_rows: audit?.n ?? 0,
    })
  })

  app.get('/api/memories', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT source_kind, source_ref, chunk_idx, substr(chunk, 1, 220) AS preview, mtime, created_at
         FROM memory_chunks ORDER BY created_at DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/tokens', c => {
    const gate = requireToken(c)
    if (gate) return gate
    const today = one<{ total: number }>(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage WHERE created_at > strftime('%s','now','-1 day') * 1000`
    )
    const byBackend = rows(
      `SELECT backend, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens, COUNT(*) AS runs
       FROM token_usage WHERE created_at > strftime('%s','now','-7 day') * 1000
       GROUP BY backend`
    )
    const recent = rows(
      `SELECT backend, model, input_tokens, output_tokens, duration_ms, created_at
       FROM token_usage ORDER BY created_at DESC LIMIT 20`
    )
    return c.json({ today: today?.total ?? 0, byBackend, recent })
  })

  app.get('/api/audit', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT event_type, detail, blocked, chat_id, agent_id, created_at
         FROM audit_log ORDER BY id DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/scheduler', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, status
         FROM scheduled_tasks ORDER BY next_run`
      ),
    })
  })

  app.get('/api/missions', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT id, title, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
         FROM mission_tasks ORDER BY created_at DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/subagents', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT mode, backend, judge, hints, prompt_preview, duration_ms, input_tokens, output_tokens, cost_usd, outcome, created_at
         FROM subagent_runs ORDER BY created_at DESC LIMIT 50`
      ),
    })
  })

  app.get('/api/vault-inbox', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT source_kind, source_ref, mtime FROM memory_chunks
         WHERE source_kind = 'vault'
         GROUP BY source_ref ORDER BY MAX(mtime) DESC LIMIT 30`
      ),
    })
  })

  app.get('/api/events', c => {
    const gate = requireToken(c)
    if (gate) return gate
    return streamSSE(c, async (stream) => {
      const push = (name: string, data: unknown): void => {
        void stream.writeSSE({ event: name, data: JSON.stringify(data) }).catch(() => {})
      }
      const handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = []
      const subscribe = <K extends keyof ChatEventPayload>(ev: K): void => {
        const fn = (payload: ChatEventPayload[K]): void => push(ev, payload)
        chatEvents.on(ev, fn)
        handlers.push({ event: ev, fn: fn as unknown as (...args: unknown[]) => void })
      }
      subscribe('session_start')
      subscribe('message_received')
      subscribe('agent_started')
      subscribe('agent_completed')
      subscribe('error')
      subscribe('session_end')

      const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {}), 30_000)
      ping.unref()

      stream.onAbort(() => {
        clearInterval(ping)
        for (const h of handlers) chatEvents.off(h.event as keyof ChatEventPayload, h.fn as never)
      })

      await new Promise(() => {
        /* keep open */
      })
    })
  })

  return app
}

let server: ServerType | null = null

export function startDashboard(): void {
  const token = resolveToken()
  if (!token) {
    logger.warn('DASHBOARD_TOKEN not set — dashboard disabled. `npm run setup` to add.')
    return
  }
  const app = buildApp()
  server = serve({ fetch: app.fetch, port: DEFAULT_PORT, hostname: '127.0.0.1' })
  logger.info({ url: `http://localhost:${DEFAULT_PORT}/?token=${token.slice(0, 6)}…` }, 'dashboard online')
}

export function stopDashboard(): void {
  if (server) {
    server.close()
    server = null
  }
}

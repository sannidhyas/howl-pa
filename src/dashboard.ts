import { Hono, type Context } from 'hono'
import { serve, type ServerType } from '@hono/node-server'
import { streamSSE } from 'hono/streaming'
import { createHmac, createHash, timingSafeEqual as tseq } from 'node:crypto'
import CronParserModule from 'cron-parser'
const { parseExpression } = CronParserModule as unknown as {
  parseExpression: (expr: string) => { next(): { getTime(): number } }
}
import {
  ALLOWED_CHAT_ID,
  DASHBOARD_HOST,
  DASHBOARD_USERNAME,
  DASHBOARD_PASSWORD_HASH,
  DASHBOARD_SESSION_SECRET,
} from './config.js'
import {
  getDb,
  audit,
  setTaskStatus,
  deleteScheduledTask,
  enqueueMission,
  updateMissionTaskStatus,
  updateScheduledFields,
  upsertScheduledTask,
} from './db.js'
import { logger } from './logger.js'
import { startMission } from './missions/runner.js'
import { MISSIONS } from './missions/index.js'
import { BUILT_INS, nextRunFor } from './scheduler.js'
import { routeCapture, type CaptureType } from './capture-router.js'
import { chatEvents, type ChatEventPayload } from './state.js'
import { dashboardHtml } from './dashboard-html.js'
import { svgMark, svgFavicon } from './logo.js'
import { registerUsageRoute } from './usage.js'

const DEFAULT_PORT = Number.parseInt(process.env.DASHBOARD_PORT ?? '3141', 10)
const SESSION_COOKIE = 'hpa_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 5
const loginAttempts = new Map<string, { count: number; first: number }>()

const NAME_RE = /^[a-z0-9_-]{1,64}$/
const CAPTURE_TYPES: CaptureType[] = [
  'note',
  'idea',
  'task',
  'literature',
  'thesis_fragment',
  'journal',
  'ephemeral',
]

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

function deriveSessionSecret(): string {
  const explicit = DASHBOARD_SESSION_SECRET
  if (explicit) return explicit
  return (process.env.PIN_SALT ?? '') + ':' + (process.env.DASHBOARD_TOKEN ?? '')
}

function signSession(timestamp: number, username: string): string {
  const secret = deriveSessionSecret()
  const hmac = createHmac('sha256', secret).update(`${timestamp}|${username}`).digest('hex')
  return `${timestamp}.${hmac}`
}

function verifySession(cookie: string | undefined): boolean {
  if (!cookie) return false
  const dot = cookie.indexOf('.')
  if (dot < 0) return false
  const ts = Number(cookie.slice(0, dot))
  if (!Number.isFinite(ts) || Date.now() - ts > SESSION_TTL_MS) return false
  const expected = signSession(ts, DASHBOARD_USERNAME)
  const a = Buffer.from(cookie)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return tseq(a, b) } catch { return false }
}

function hashPassword(password: string): string {
  const salt = process.env.PIN_SALT || process.env.DASHBOARD_PASSWORD_SALT || ''
  return createHash('sha256').update(`${salt}:${password}`).digest('hex')
}

function verifyPassword(username: string, password: string): boolean {
  if (!DASHBOARD_PASSWORD_HASH) return false
  if (username !== DASHBOARD_USERNAME) return false
  const hash = hashPassword(password)
  const a = Buffer.from(hash)
  const b = Buffer.from(DASHBOARD_PASSWORD_HASH)
  if (a.length !== b.length) return false
  try { return tseq(a, b) } catch { return false }
}

function checkLoginRate(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now - entry.first > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function recordLoginFailure(ip: string): void {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now - entry.first > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now })
  } else {
    entry.count++
  }
}

function requireAuth(c: Context): Response | null {
  const token = c.req.query('token') ?? c.req.header('x-dashboard-token')
  if (verifyToken(token)) return null

  const cookieHeader = c.req.header('cookie') ?? ''
  const cookieVal = cookieHeader
    .split(';')
    .map(p => p.trim())
    .find(p => p.startsWith(SESSION_COOKIE + '='))
    ?.slice(SESSION_COOKIE.length + 1)
  if (verifySession(cookieVal)) return null

  const basic = c.req.header('authorization')
  if (basic?.startsWith('Basic ')) {
    const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8')
    const colon = decoded.indexOf(':')
    if (colon >= 0) {
      const user = decoded.slice(0, colon)
      const pass = decoded.slice(colon + 1)
      if (verifyPassword(user, pass)) return null
    }
  }

  return new Response('unauthorized', { status: 401 })
}

function validateName(c: Context): { name: string } | Response {
  const name = c.req.param('name') ?? ''
  if (!NAME_RE.test(name)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid name format' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { name }
}

function requireJson(c: Context): Response | null {
  const ct = c.req.header('content-type') ?? ''
  if (!ct.includes('application/json')) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Content-Type: application/json required' }),
      { status: 415, headers: { 'content-type': 'application/json' } }
    )
  }
  return null
}

async function readJsonObject(c: Context): Promise<Record<string, unknown> | Response> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid json' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ ok: false, error: 'body must be object' }, 400)
  }
  return body as Record<string, unknown>
}

function cronError(schedule: string): string | null {
  try {
    parseExpression(schedule)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function isCaptureType(value: unknown): value is CaptureType {
  return typeof value === 'string' && CAPTURE_TYPES.includes(value as CaptureType)
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

function loginHtml(): string {
  const hasPassword = !!DASHBOARD_PASSWORD_HASH
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Howl PA — sign in</title>
<link rel="icon" href="${svgFavicon()}" />
<meta name="theme-color" content="#0b0c10" />
<style>
  html,body{height:100%;margin:0;background:#0b0c10;color:#edf0f6;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#13151b;border:1px solid #272b36;border-radius:12px;padding:28px 30px;max-width:420px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  h1{margin:0 0 4px 0;font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#edf0f6;display:flex;align-items:center;gap:10px}
  h1 .logo{color:#7cc5ff;display:inline-flex}
  p.sub{color:#a1a7b5;margin:0 0 18px 0;font-size:13px}
  .divider{border:none;border-top:1px solid #272b36;margin:20px 0}
  label{display:block;color:#a1a7b5;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;margin-top:10px}
  input{width:100%;background:#0b0c10;color:#edf0f6;border:1px solid #272b36;border-radius:6px;padding:9px 11px;font:inherit;font-family:ui-monospace,"JetBrains Mono",SFMono-Regular,monospace;font-size:13px;box-sizing:border-box}
  input:focus{outline:none;border-color:#4b8cc9;background:#191c24}
  button{margin-top:16px;width:100%;background:#4b8cc9;border:1px solid #7cc5ff;color:#0b0c10;padding:10px;border-radius:6px;font:inherit;font-weight:500;cursor:pointer;transition:background .15s}
  button:hover{background:#7cc5ff}
  .hint{margin-top:16px;padding:10px 12px;background:#0b0c10;border:1px solid #272b36;border-radius:6px;font-size:12px;color:#a1a7b5}
  .hint code{color:#7cc5ff;background:#21252f;padding:1px 6px;border-radius:3px;font-family:ui-monospace,"JetBrains Mono",monospace;font-size:11.5px}
  .err{color:#f08a7a;font-size:12px;margin-top:8px}
</style></head>
<body><div class="wrap"><div class="card">
  <h1><span class="logo">${svgMark(22)}</span>Howl PA</h1>
  <p class="sub">Dashboard access required.</p>
  ${hasPassword ? `
  <form id="pwform">
    <label for="u">Username</label>
    <input id="u" name="username" autocomplete="username" value="${DASHBOARD_USERNAME}" spellcheck="false" />
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password" />
    <div class="err" id="pwerr" style="display:none">Invalid credentials. Try again.</div>
    <button type="submit">Sign in with password</button>
  </form>
  <hr class="divider"/>
  ` : ''}
  <form onsubmit="return goToken(event)">
    <label for="t">DASHBOARD_TOKEN</label>
    <input id="t" autocomplete="off" ${!hasPassword ? 'autofocus ' : ''}placeholder="paste token" spellcheck="false" />
    <div class="err" id="tokerr" style="display:none">Token did not match. Try again.</div>
    <button type="submit">Sign in with token</button>
    <div class="hint">
      Token lives in your config <code>.env</code> under <code>DASHBOARD_TOKEN</code>.<br/>
      Find it: <code>grep DASHBOARD_TOKEN ~/.config/howl-pa/.env</code>
    </div>
  </form>
</div></div>
<script>
  const p = new URLSearchParams(location.search);
  if (p.get('token')) document.getElementById('tokerr').style.display='block';
  if (p.get('login_failed')) document.getElementById('pwerr') && (document.getElementById('pwerr').style.display='block');
  function goToken(ev){
    ev.preventDefault();
    const t = document.getElementById('t').value.trim();
    if (!t) return false;
    location.href = '/?token=' + encodeURIComponent(t);
    return false;
  }
  ${hasPassword ? `
  document.getElementById('pwform').addEventListener('submit', async function(ev){
    ev.preventDefault();
    const u = document.getElementById('u').value.trim();
    const p = document.getElementById('p').value;
    const res = await fetch('/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    if (res.ok) { location.href = '/'; return; }
    document.getElementById('pwerr').style.display='block';
  });
  ` : ''}
</script>
</body></html>`
}

function buildApp(): Hono {
  const app = new Hono()

  app.post('/api/auth/login', async c => {
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (!checkLoginRate(ip)) {
      return c.json({ ok: false, error: 'too many attempts' }, 429)
    }

    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ ok: false, error: 'body must be object' }, 400)
    }
    const { username, password } = body as Record<string, unknown>
    if (typeof username !== 'string' || typeof password !== 'string') {
      return c.json({ ok: false, error: 'username and password required' }, 400)
    }

    if (!verifyPassword(username, password)) {
      recordLoginFailure(ip)
      return c.json({ ok: false, error: 'invalid credentials' }, 401)
    }

    const ts = Date.now()
    const cookieVal = signSession(ts, username)
    const isHttps = c.req.header('x-forwarded-proto') === 'https'
    const cookieFlags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${isHttps ? '; Secure' : ''}`
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `${SESSION_COOKIE}=${cookieVal}; ${cookieFlags}`,
      },
    })
  })

  app.post('/api/auth/logout', c => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `${SESSION_COOKIE}=; Max-Age=0; Path=/`,
      },
    })
  })

  app.get('/', c => {
    const token = c.req.query('token') ?? c.req.header('x-dashboard-token')
    if (verifyToken(token)) return c.html(dashboardHtml(resolveToken()))
    const cookieHeader = c.req.header('cookie') ?? ''
    const cookieVal = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1)
    if (verifySession(cookieVal)) return c.html(dashboardHtml(resolveToken()))
    const basic = c.req.header('authorization')
    if (basic?.startsWith('Basic ')) {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8')
      const colon = decoded.indexOf(':')
      if (colon >= 0 && verifyPassword(decoded.slice(0, colon), decoded.slice(colon + 1))) return c.html(dashboardHtml(resolveToken()))
    }
    return c.html(loginHtml(), 401)
  })

  app.get('/api/health', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const convo = one<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_log')
    const chunks = one<{ n: number }>('SELECT COUNT(*) AS n FROM memory_chunks')
    const auditCount = one<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')
    return c.json({
      ok: true,
      uptime_s: Math.floor(process.uptime()),
      pid: process.pid,
      convo_rows: convo?.n ?? 0,
      memory_chunks: chunks?.n ?? 0,
      audit_rows: auditCount?.n ?? 0,
    })
  })

  app.get('/api/memories', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT source_kind, source_ref, chunk_idx, substr(chunk, 1, 220) AS preview, mtime, created_at
         FROM memory_chunks ORDER BY created_at DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/tokens', c => {
    const gate = requireAuth(c)
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
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT event_type, detail, blocked, chat_id, agent_id, ref_kind, ref_id, created_at
         FROM audit_log ORDER BY id DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/scheduler', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const builtinNames = new Set(BUILT_INS.map(b => b.name))
    const data = rows(
      `SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, status
       FROM scheduled_tasks ORDER BY next_run`
    )
    return c.json({
      rows: data.map(r => ({ ...r, is_builtin: builtinNames.has(r.name as string) })),
    })
  })

  app.post('/api/scheduler', async c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const body = await readJsonObject(c)
    if (body instanceof Response) return body

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!NAME_RE.test(name)) {
      return c.json({ ok: false, error: 'invalid name format' }, 400)
    }

    const mission = typeof body.mission === 'string' ? body.mission : ''
    if (!Object.hasOwn(MISSIONS, mission)) {
      return c.json({ ok: false, error: `unknown mission; valid: ${Object.keys(MISSIONS).join(', ')}` }, 400)
    }

    const schedule = typeof body.schedule === 'string' ? body.schedule.trim() : ''
    if (!schedule) {
      return c.json({ ok: false, error: 'schedule required' }, 400)
    }
    const cronErr = cronError(schedule)
    if (cronErr) {
      return c.json({ ok: false, error: `invalid cron: ${cronErr}` }, 400)
    }

    let priority = 0
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'number' || !Number.isInteger(body.priority)) {
        return c.json({ ok: false, error: 'priority must be integer' }, 400)
      }
      priority = Math.max(0, Math.min(100, body.priority))
    }

    let args: Record<string, unknown> | undefined
    if (body.args !== undefined) {
      if (!body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
        return c.json({ ok: false, error: 'args must be object' }, 400)
      }
      args = body.args as Record<string, unknown>
    }

    const existing = one<{ id: number }>('SELECT id FROM scheduled_tasks WHERE name = ?', name)
    if (existing) {
      return c.json({ ok: false, error: 'name exists' }, 409)
    }

    let nextRun: number
    try {
      nextRun = nextRunFor(schedule)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ ok: false, error: `invalid cron: ${msg}` }, 400)
    }

    upsertScheduledTask({
      name,
      mission,
      schedule,
      nextRun,
      priority,
      agentId: 'main',
      status: 'active',
      args: JSON.stringify(args ?? {}),
    })
    audit('scheduler_create', name + ' / ' + mission)
    return c.json({ ok: true, name, next_run: nextRun })
  })

  app.patch('/api/scheduler/:name', async c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate
    const v = validateName(c)
    if (v instanceof Response) return v
    const { name } = v

    const row = one<{ id: number; schedule: string; priority: number; status: string }>(
      'SELECT id, schedule, priority, status FROM scheduled_tasks WHERE name = ?',
      name
    )
    if (!row) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }

    const body = await readJsonObject(c)
    if (body instanceof Response) return body

    const patch: Parameters<typeof updateScheduledFields>[1] = {}
    const changedFields: string[] = []

    if (body.schedule !== undefined) {
      if (typeof body.schedule !== 'string' || !body.schedule.trim()) {
        return c.json({ ok: false, error: 'schedule must be string' }, 400)
      }
      const schedule = body.schedule.trim()
      const cronErr = cronError(schedule)
      if (cronErr) {
        return c.json({ ok: false, error: `invalid cron: ${cronErr}` }, 400)
      }
      patch.schedule = schedule
      changedFields.push('schedule')
      if (schedule !== row.schedule) {
        try {
          patch.nextRun = nextRunFor(schedule)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return c.json({ ok: false, error: `invalid cron: ${msg}` }, 400)
        }
      }
    }

    if (body.priority !== undefined) {
      if (typeof body.priority !== 'number' || !Number.isInteger(body.priority)) {
        return c.json({ ok: false, error: 'priority must be integer' }, 400)
      }
      patch.priority = Math.max(0, Math.min(100, body.priority))
      changedFields.push('priority')
    }

    if (body.args !== undefined) {
      if (!body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
        return c.json({ ok: false, error: 'args must be object' }, 400)
      }
      patch.args = JSON.stringify(body.args)
      changedFields.push('args')
    }

    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'paused') {
        return c.json({ ok: false, error: 'status must be active or paused' }, 400)
      }
      patch.status = body.status
      changedFields.push('status')
    }

    if (changedFields.length === 0) {
      return c.json({ ok: false, error: 'no valid fields provided' }, 400)
    }

    if (!updateScheduledFields(name, patch)) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    audit('scheduler_edit', name + ' — ' + changedFields.join(','))
    return c.json({ ok: true, name, updated: changedFields })
  })

  app.post('/api/scheduler/:name/run-now', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate
    const v = validateName(c)
    if (v instanceof Response) return v
    const { name } = v

    type TaskRow = { id: number; mission: string; args: string | null; status: string }
    const task = one<TaskRow>(
      'SELECT id, mission, args, status FROM scheduled_tasks WHERE name = ?',
      name
    )
    if (!task) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    if (task.status === 'running') {
      return c.json({ ok: false, error: 'already running' }, 409)
    }

    let parsedArgs: Record<string, unknown> | undefined
    if (task.args) {
      try {
        const parsed = JSON.parse(task.args) as unknown
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedArgs = parsed as Record<string, unknown>
        }
      } catch (err: unknown) {
        logger.error({ err, task: name }, 'invalid scheduled task args — ignoring')
      }
    }

    let started: ReturnType<typeof startMission>
    try {
      started = startMission({
        mission: task.mission,
        args: parsedArgs,
        source: 'dashboard',
        title: name,
        scheduledTaskId: task.id,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ err, task: name }, 'run-now enqueue failed')
      return c.json({ ok: false, error: msg.slice(0, 400) }, 500)
    }

    const { missionTaskId, done } = started
    audit('scheduler_run_now', `queued ${task.mission} as mission_task #${missionTaskId}`, {
      ref_kind: 'mission_task',
      ref_id: missionTaskId,
    })
    done
      .then(result => {
        if (!result.ok) {
          logger.error({ result, task: name }, 'run-now mission failed')
        }
      })
      .catch((err: unknown) => {
        logger.error({ err, task: name }, 'run-now completion failed')
      })

    return c.json({
      ok: true,
      mission: task.mission,
      mission_task_id: missionTaskId,
      queued_at: Date.now(),
    })
  })

  app.post('/api/scheduler/:name/pause', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate
    const v = validateName(c)
    if (v instanceof Response) return v
    const { name } = v

    if (!setTaskStatus(name, 'paused')) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    audit('scheduler_pause', name)
    return c.json({ ok: true, name, status: 'paused' })
  })

  app.post('/api/scheduler/:name/resume', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate
    const v = validateName(c)
    if (v instanceof Response) return v
    const { name } = v

    if (!setTaskStatus(name, 'active')) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    audit('scheduler_resume', name)
    return c.json({ ok: true, name, status: 'active' })
  })

  app.post('/api/scheduler/:name/delete', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate
    const v = validateName(c)
    if (v instanceof Response) return v
    const { name } = v

    if (!deleteScheduledTask(name)) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    audit('scheduler_delete', name)

    const builtinNames = new Set(BUILT_INS.map(b => b.name))
    if (builtinNames.has(name)) {
      return c.json({
        ok: true,
        name,
        deleted: true,
        note: 'built-in — will re-register on next scheduler init; pause if you want a durable stop',
      })
    }
    return c.json({ ok: true, name, deleted: true })
  })

  app.get('/api/missions/catalog', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const builtinNames = new Set(BUILT_INS.map(b => b.name))
    return c.json({
      ok: true,
      missions: BUILT_INS
        .map(b => ({ id: b.name, description: b.description }))
        .concat(
          Object.keys(MISSIONS)
            .filter(k => !builtinNames.has(k))
            .map(k => ({ id: k, description: '' }))
        ),
    })
  })

  app.post('/api/missions/adhoc', async c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const body = await readJsonObject(c)
    if (body instanceof Response) return body

    const mission = typeof body.mission === 'string' ? body.mission : ''
    if (!Object.hasOwn(MISSIONS, mission)) {
      return c.json({ ok: false, error: `unknown mission; valid: ${Object.keys(MISSIONS).join(', ')}` }, 400)
    }

    let args: Record<string, unknown> | undefined
    if (body.args !== undefined) {
      if (!body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
        return c.json({ ok: false, error: 'args must be object' }, 400)
      }
      args = body.args as Record<string, unknown>
    }

    if (body.title !== undefined && typeof body.title !== 'string') {
      return c.json({ ok: false, error: 'title must be string' }, 400)
    }
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : `${mission}:adhoc`

    let started: ReturnType<typeof startMission>
    try {
      started = startMission({
        mission,
        args,
        source: 'dashboard',
        title,
        agentId: 'manual',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ err, mission }, 'adhoc enqueue failed')
      return c.json({ ok: false, error: msg.slice(0, 400) }, 500)
    }

    const { missionTaskId, done } = started
    audit('mission_adhoc', mission, { ref_kind: 'mission_task', ref_id: missionTaskId })
    done
      .then(result => {
        if (!result.ok) {
          logger.error({ result, mission }, 'adhoc mission failed')
        }
      })
      .catch((err: unknown) => {
        logger.error({ err, mission }, 'adhoc completion failed')
      })

    return c.json({ ok: true, mission, mission_task_id: missionTaskId, queued_at: Date.now() })
  })

  app.get('/api/missions', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT id, title, mission, assigned_agent, priority, source, scheduled_task_id, status, result, started_at, completed_at, created_at
         FROM mission_tasks ORDER BY created_at DESC LIMIT 100`
      ),
    })
  })

  app.get('/api/transcript', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const kind = c.req.query('kind')
    const id = c.req.query('id')
    if (!kind || !id) {
      return c.json({ ok: false, error: 'kind and id are required' }, 400)
    }

    if (kind === 'mission_task') {
      const missionId = Number.parseInt(id, 10)
      if (!Number.isSafeInteger(missionId) || missionId <= 0) {
        return c.json({ ok: false, error: 'invalid mission task id' }, 400)
      }
      const row = one<Row>('SELECT * FROM mission_tasks WHERE id = ?', missionId)
      if (!row) return c.json({ ok: false, error: 'not found' }, 404)
      return c.json({ ok: true, kind, id: missionId, row })
    }

    if (kind === 'conversation') {
      const transcriptRows = rows(
        `SELECT id, session_id, chat_id, agent_id, role, content, created_at
         FROM conversation_log WHERE session_id = ? ORDER BY created_at ASC`,
        id
      )
      if (transcriptRows.length === 0) {
        return c.json({ ok: false, error: 'not found' }, 404)
      }
      return c.json({ ok: true, kind, id, rows: transcriptRows })
    }

    return c.json({ ok: false, error: 'unknown transcript kind' }, 404)
  })

  app.post('/api/missions/:id/retry', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const idRaw = c.req.param('id')
    const id = Number.parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return c.json({ ok: false, error: 'invalid id' }, 400)
    }

    type MRow = {
      id: number
      title: string
      mission: string | null
      assigned_agent: string
      priority: number
      status: string
    }
    const original = one<MRow>(
      'SELECT id, title, mission, assigned_agent, priority, status FROM mission_tasks WHERE id = ?',
      id
    )
    if (!original) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    if (original.status === 'running' || original.status === 'queued') {
      return c.json({ ok: false, error: 'already in flight' }, 409)
    }
    if (!original.mission) {
      return c.json(
        { ok: false, error: 'not a retryable mission — use the chat interface' },
        400
      )
    }

    const newId = enqueueMission({
      title: original.title,
      mission: original.mission,
      assignedAgent: original.assigned_agent,
      priority: original.priority,
    })
    audit('mission_retry', `retrying #${id} as #${newId}`)
    return c.json({ ok: true, mission_id: newId })
  })

  app.post('/api/missions/:id/cancel', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const idRaw = c.req.param('id')
    const id = Number.parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return c.json({ ok: false, error: 'invalid id' }, 400)
    }

    type MRow = { id: number; status: string }
    const task = one<MRow>('SELECT id, status FROM mission_tasks WHERE id = ?', id)
    if (!task) {
      return c.json({ ok: false, error: 'not found' }, 404)
    }
    if (task.status === 'running') {
      return c.json({ ok: false, error: 'cannot cancel in-flight mission' }, 409)
    }
    if (
      task.status === 'done' ||
      task.status === 'failed' ||
      task.status === 'cancelled'
    ) {
      return c.json({ ok: false, error: 'already terminal' }, 409)
    }

    updateMissionTaskStatus(id, 'cancelled', 'cancelled via dashboard')
    audit('mission_cancel', `mission #${id}`)
    return c.json({ ok: true, mission_id: id, status: 'cancelled' })
  })

  app.get('/api/capture/kinds', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      ok: true,
      kinds: [
        { id: 'note', label: 'Note', description: 'Quick text note stored in the vault', emoji: '📝' },
        { id: 'idea', label: 'Idea', description: 'Venture or startup concept — runs the full idea-flow pipeline', emoji: '💡' },
        { id: 'task', label: 'Task', description: 'Action item synced to Google Tasks and vault', emoji: '✅' },
        { id: 'literature', label: 'Literature', description: 'Reference to a paper, book, or article', emoji: '📚' },
        { id: 'thesis_fragment', label: 'Thesis Fragment', description: 'Argument, data, or phrasing for the PhD thesis', emoji: '🎓' },
        { id: 'journal', label: 'Journal', description: 'Reflective diary entry or daily log', emoji: '📓' },
        { id: 'ephemeral', label: 'Ephemeral', description: 'Transient note — not persisted to vault', emoji: '💨' },
      ],
    })
  })

  app.post('/api/capture', async c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    const body = await readJsonObject(c)
    if (body instanceof Response) return body

    if (typeof body.text !== 'string') {
      return c.json({ ok: false, error: 'text required' }, 400)
    }
    const text = body.text.trim()
    if (!text) {
      return c.json({ ok: false, error: 'text required' }, 400)
    }
    if (text.length > 5000) {
      return c.json({ ok: false, error: 'text too long' }, 400)
    }

    let kind: CaptureType | undefined
    if (body.kind !== undefined) {
      if (!isCaptureType(body.kind)) {
        return c.json({ ok: false, error: 'invalid kind' }, 400)
      }
      kind = body.kind
    }

    if (body.title !== undefined && typeof body.title !== 'string') {
      return c.json({ ok: false, error: 'title must be string' }, 400)
    }

    let result: Awaited<ReturnType<typeof routeCapture>>
    try {
      result = await routeCapture(text, kind)
    } catch (err) {
      logger.error({ err }, 'capture route failed')
      return c.json({ ok: false, error: 'capture failed' }, 500)
    }

    if (result === null) {
      return c.json({ ok: false, error: 'classify failed' }, 500)
    }

    audit('capture', result.type + ': ' + text.slice(0, 80))

    if (result.type === 'ephemeral') {
      return c.json({ ok: true, kind: 'ephemeral', summary: 'not persisted', ref: {} })
    }

    return c.json({
      ok: true,
      kind: result.type,
      summary: result.classification.slug,
      ref: { vault_path: result.vaultRel },
    })
  })

  app.get('/api/subagents', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT mode, backend, role, judge, hints, prompt_preview, duration_ms, input_tokens, output_tokens, cost_usd, outcome, created_at
         FROM subagent_runs ORDER BY created_at DESC LIMIT 50`
      ),
    })
  })

  app.get('/api/roles', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const windowHours = Number.parseInt(c.req.query('hours') ?? '168', 10) || 168
    const since = Date.now() - windowHours * 3600 * 1000
    return c.json({
      since,
      hours: windowHours,
      rows: rows(
        `SELECT COALESCE(role, 'unknown') AS role,
                COUNT(*) AS n,
                SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS ok,
                SUM(CASE WHEN outcome IN ('error','timeout') THEN 1 ELSE 0 END) AS err,
                AVG(duration_ms) AS avg_ms
           FROM subagent_runs WHERE created_at >= ?
           GROUP BY COALESCE(role, 'unknown') ORDER BY n DESC`,
        since
      ),
    })
  })

  app.get('/api/gmail', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT id, sender, subject, snippet, internal_date, unread, importance, importance_reason, classified_at
         FROM gmail_items
         ORDER BY internal_date DESC LIMIT 50`
      ),
    })
  })

  app.get('/api/calendar', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const windowHours = Number.parseInt(c.req.query('hours') ?? '48', 10) || 48
    const from = Date.now() - 6 * 3600 * 1000
    const to = Date.now() + windowHours * 3600 * 1000
    return c.json({
      from,
      to,
      hours: windowHours,
      rows: rows(
        `SELECT id, summary, location, starts_at, ends_at, html_link, meet_link, attendees
         FROM calendar_events
         WHERE starts_at BETWEEN ? AND ?
         ORDER BY starts_at ASC`,
        from,
        to
      ),
    })
  })

  app.get('/api/tasks', c => {
    const gate = requireAuth(c)
    if (gate) return gate
    return c.json({
      rows: rows(
        `SELECT id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason
         FROM tasks_items
         ORDER BY CASE status WHEN 'needs_push' THEN 0 WHEN 'needsAction' THEN 1 ELSE 2 END,
                  COALESCE(due_ts, updated_at) ASC
         LIMIT 100`
      ),
    })
  })

  app.get('/api/vault-inbox', c => {
    const gate = requireAuth(c)
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
    const gate = requireAuth(c)
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
      subscribe('chat_error')
      subscribe('session_end')

      const ping = setInterval(
        () => void stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {}),
        30_000
      )
      ping.unref()

      stream.onAbort(() => {
        clearInterval(ping)
        for (const h of handlers)
          chatEvents.off(h.event as keyof ChatEventPayload, h.fn as never)
      })

      await new Promise(() => {
        /* keep open */
      })
    })
  })

  app.post('/api/events/test', async c => {
    const gate = requireAuth(c)
    if (gate) return gate
    const ctGate = requireJson(c)
    if (ctGate) return ctGate

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'invalid json' }, 400)
    }
    if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
      return c.json({ ok: false, error: 'json body must be an object' }, 400)
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const chatId = typeof payload.chatId === 'string' ? payload.chatId : undefined
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
    const category = typeof payload.category === 'string' ? payload.category : 'dashboard-test'
    const message = typeof payload.message === 'string'
      ? payload.message
      : 'dashboard test event'
    chatEvents.emit('chat_error', { chatId, sessionId, category, message })
    return c.json({ ok: true, emitted: true, default_chat_id: ALLOWED_CHAT_ID })
  })

  registerUsageRoute(app, requireAuth)

  return app
}

let server: ServerType | null = null

export function startDashboard(): void {
  const token = resolveToken()
  if (!token) {
    logger.warn('DASHBOARD_TOKEN not set — dashboard disabled. `npm run setup` to add.')
    return
  }
  if (DASHBOARD_HOST !== '127.0.0.1' && !DASHBOARD_PASSWORD_HASH) {
    logger.warn({ host: DASHBOARD_HOST }, 'dashboard is open to non-localhost with no password — set DASHBOARD_PASSWORD_HASH via setup')
  }
  const app = buildApp()
  server = serve({ fetch: app.fetch, port: DEFAULT_PORT, hostname: DASHBOARD_HOST })
  logger.info(
    { url: `http://localhost:${DEFAULT_PORT}/?token=${token}` },
    'dashboard online — open this URL in a browser on this host'
  )
}

export function stopDashboard(): void {
  if (server) {
    server.close()
    server = null
  }
}

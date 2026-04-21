import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { timingSafeEqual as tseq } from 'node:crypto';
import { getDb, audit, setTaskStatus, deleteScheduledTask, enqueueMission, updateMissionTaskStatus, } from './db.js';
import { logger } from './logger.js';
import { BUILT_INS, runMissionByName } from './scheduler.js';
import { chatEvents } from './state.js';
import { dashboardHtml } from './dashboard-html.js';
const DEFAULT_PORT = Number.parseInt(process.env.DASHBOARD_PORT ?? '3141', 10);
function resolveToken() {
    return process.env.DASHBOARD_TOKEN ?? '';
}
function verifyToken(token) {
    const expected = resolveToken();
    if (!expected)
        return false;
    if (!token)
        return false;
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length)
        return false;
    try {
        return tseq(a, b);
    }
    catch {
        return false;
    }
}
function requireToken(c) {
    const token = c.req.query('token') ?? c.req.header('x-dashboard-token');
    if (!verifyToken(token)) {
        return new Response('unauthorized', { status: 401 });
    }
    return null;
}
const NAME_RE = /^[a-z0-9_-]{1,64}$/i;
function validateName(c) {
    const name = c.req.param('name') ?? '';
    if (!NAME_RE.test(name)) {
        return new Response(JSON.stringify({ ok: false, error: 'invalid name' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    }
    return { name };
}
function requireJson(c) {
    const ct = c.req.header('content-type') ?? '';
    if (!ct.includes('application/json')) {
        return new Response(JSON.stringify({ ok: false, error: 'Content-Type: application/json required' }), { status: 415, headers: { 'content-type': 'application/json' } });
    }
    return null;
}
function rows(sql, ...args) {
    return getDb()
        .prepare(sql)
        .all(...args);
}
function one(sql, ...args) {
    return getDb()
        .prepare(sql)
        .get(...args);
}
function buildApp() {
    const app = new Hono();
    app.get('/', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.html(dashboardHtml(resolveToken()));
    });
    app.get('/api/health', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const convo = one('SELECT COUNT(*) AS n FROM conversation_log');
        const chunks = one('SELECT COUNT(*) AS n FROM memory_chunks');
        const auditCount = one('SELECT COUNT(*) AS n FROM audit_log');
        return c.json({
            ok: true,
            uptime_s: Math.floor(process.uptime()),
            pid: process.pid,
            convo_rows: convo?.n ?? 0,
            memory_chunks: chunks?.n ?? 0,
            audit_rows: auditCount?.n ?? 0,
        });
    });
    app.get('/api/memories', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT source_kind, source_ref, chunk_idx, substr(chunk, 1, 220) AS preview, mtime, created_at
         FROM memory_chunks ORDER BY created_at DESC LIMIT 100`),
        });
    });
    app.get('/api/tokens', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const today = one(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage WHERE created_at > strftime('%s','now','-1 day') * 1000`);
        const byBackend = rows(`SELECT backend, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens, COUNT(*) AS runs
       FROM token_usage WHERE created_at > strftime('%s','now','-7 day') * 1000
       GROUP BY backend`);
        const recent = rows(`SELECT backend, model, input_tokens, output_tokens, duration_ms, created_at
       FROM token_usage ORDER BY created_at DESC LIMIT 20`);
        return c.json({ today: today?.total ?? 0, byBackend, recent });
    });
    app.get('/api/audit', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT event_type, detail, blocked, chat_id, agent_id, created_at
         FROM audit_log ORDER BY id DESC LIMIT 100`),
        });
    });
    app.get('/api/scheduler', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const builtinNames = new Set(BUILT_INS.map(b => b.name));
        const data = rows(`SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, status
       FROM scheduled_tasks ORDER BY next_run`);
        return c.json({
            rows: data.map(r => ({ ...r, is_builtin: builtinNames.has(r.name) })),
        });
    });
    app.post('/api/scheduler/:name/run-now', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const v = validateName(c);
        if (v instanceof Response)
            return v;
        const { name } = v;
        const task = one('SELECT id, mission, args, status FROM scheduled_tasks WHERE name = ?', name);
        if (!task) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        if (task.status === 'running') {
            return c.json({ ok: false, error: 'already running' }, 409);
        }
        let parsedArgs;
        if (task.args) {
            try {
                const parsed = JSON.parse(task.args);
                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    parsedArgs = parsed;
                }
            }
            catch (err) {
                logger.error({ err, task: name }, 'invalid scheduled task args — ignoring');
            }
        }
        runMissionByName(task.mission, parsedArgs)
            .then(summary => {
            audit('scheduler_run_now', `ok: ${summary}`);
        })
            .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error({ err, task: name }, 'run-now failed');
            audit('scheduler_run_now', `error: ${msg}`, { blocked: false });
        });
        return c.json({ ok: true, mission: task.mission, queued_at: Date.now() });
    });
    app.post('/api/scheduler/:name/pause', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const v = validateName(c);
        if (v instanceof Response)
            return v;
        const { name } = v;
        if (!setTaskStatus(name, 'paused')) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        audit('scheduler_pause', name);
        return c.json({ ok: true, name, status: 'paused' });
    });
    app.post('/api/scheduler/:name/resume', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const v = validateName(c);
        if (v instanceof Response)
            return v;
        const { name } = v;
        if (!setTaskStatus(name, 'active')) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        audit('scheduler_resume', name);
        return c.json({ ok: true, name, status: 'active' });
    });
    app.post('/api/scheduler/:name/delete', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const v = validateName(c);
        if (v instanceof Response)
            return v;
        const { name } = v;
        if (!deleteScheduledTask(name)) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        audit('scheduler_delete', name);
        const builtinNames = new Set(BUILT_INS.map(b => b.name));
        if (builtinNames.has(name)) {
            return c.json({
                ok: true,
                name,
                deleted: true,
                note: 'built-in — will re-register on next scheduler init; pause if you want a durable stop',
            });
        }
        return c.json({ ok: true, name, deleted: true });
    });
    app.get('/api/missions', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT id, title, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
         FROM mission_tasks ORDER BY created_at DESC LIMIT 100`),
        });
    });
    app.post('/api/missions/:id/retry', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const idRaw = c.req.param('id');
        const id = Number.parseInt(idRaw, 10);
        if (Number.isNaN(id)) {
            return c.json({ ok: false, error: 'invalid id' }, 400);
        }
        const original = one('SELECT id, title, mission, assigned_agent, priority, status FROM mission_tasks WHERE id = ?', id);
        if (!original) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        if (original.status === 'running' || original.status === 'queued') {
            return c.json({ ok: false, error: 'already in flight' }, 409);
        }
        if (!original.mission) {
            return c.json({ ok: false, error: 'not a retryable mission — use the chat interface' }, 400);
        }
        const newId = enqueueMission({
            title: original.title,
            mission: original.mission,
            assignedAgent: original.assigned_agent,
            priority: original.priority,
        });
        audit('mission_retry', `retrying #${id} as #${newId}`);
        return c.json({ ok: true, mission_id: newId });
    });
    app.post('/api/missions/:id/cancel', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const ctGate = requireJson(c);
        if (ctGate)
            return ctGate;
        const idRaw = c.req.param('id');
        const id = Number.parseInt(idRaw, 10);
        if (Number.isNaN(id)) {
            return c.json({ ok: false, error: 'invalid id' }, 400);
        }
        const task = one('SELECT id, status FROM mission_tasks WHERE id = ?', id);
        if (!task) {
            return c.json({ ok: false, error: 'not found' }, 404);
        }
        if (task.status === 'running') {
            return c.json({ ok: false, error: 'cannot cancel in-flight mission' }, 409);
        }
        if (task.status === 'done' ||
            task.status === 'failed' ||
            task.status === 'cancelled') {
            return c.json({ ok: false, error: 'already terminal' }, 409);
        }
        updateMissionTaskStatus(id, 'cancelled', 'cancelled via dashboard');
        audit('mission_cancel', `mission #${id}`);
        return c.json({ ok: true, mission_id: id, status: 'cancelled' });
    });
    app.get('/api/subagents', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT mode, backend, role, judge, hints, prompt_preview, duration_ms, input_tokens, output_tokens, cost_usd, outcome, created_at
         FROM subagent_runs ORDER BY created_at DESC LIMIT 50`),
        });
    });
    app.get('/api/roles', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const windowHours = Number.parseInt(c.req.query('hours') ?? '168', 10) || 168;
        const since = Date.now() - windowHours * 3600 * 1000;
        return c.json({
            since,
            hours: windowHours,
            rows: rows(`SELECT COALESCE(role, 'unknown') AS role,
                COUNT(*) AS n,
                SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS ok,
                SUM(CASE WHEN outcome IN ('error','timeout') THEN 1 ELSE 0 END) AS err,
                AVG(duration_ms) AS avg_ms
           FROM subagent_runs WHERE created_at >= ?
           GROUP BY COALESCE(role, 'unknown') ORDER BY n DESC`, since),
        });
    });
    app.get('/api/gmail', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT id, sender, subject, snippet, internal_date, unread, importance, importance_reason, classified_at
         FROM gmail_items
         ORDER BY internal_date DESC LIMIT 50`),
        });
    });
    app.get('/api/calendar', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        const windowHours = Number.parseInt(c.req.query('hours') ?? '48', 10) || 48;
        const from = Date.now() - 6 * 3600 * 1000;
        const to = Date.now() + windowHours * 3600 * 1000;
        return c.json({
            from,
            to,
            hours: windowHours,
            rows: rows(`SELECT id, summary, location, starts_at, ends_at, html_link, meet_link, attendees
         FROM calendar_events
         WHERE starts_at BETWEEN ? AND ?
         ORDER BY starts_at ASC`, from, to),
        });
    });
    app.get('/api/tasks', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason
         FROM tasks_items
         ORDER BY CASE status WHEN 'needs_push' THEN 0 WHEN 'needsAction' THEN 1 ELSE 2 END,
                  COALESCE(due_ts, updated_at) ASC
         LIMIT 100`),
        });
    });
    app.get('/api/vault-inbox', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return c.json({
            rows: rows(`SELECT source_kind, source_ref, mtime FROM memory_chunks
         WHERE source_kind = 'vault'
         GROUP BY source_ref ORDER BY MAX(mtime) DESC LIMIT 30`),
        });
    });
    app.get('/api/events', c => {
        const gate = requireToken(c);
        if (gate)
            return gate;
        return streamSSE(c, async (stream) => {
            const push = (name, data) => {
                void stream.writeSSE({ event: name, data: JSON.stringify(data) }).catch(() => { });
            };
            const handlers = [];
            const subscribe = (ev) => {
                const fn = (payload) => push(ev, payload);
                chatEvents.on(ev, fn);
                handlers.push({ event: ev, fn: fn });
            };
            subscribe('session_start');
            subscribe('message_received');
            subscribe('agent_started');
            subscribe('agent_completed');
            subscribe('chat_error');
            subscribe('session_end');
            const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => { }), 30_000);
            ping.unref();
            stream.onAbort(() => {
                clearInterval(ping);
                for (const h of handlers)
                    chatEvents.off(h.event, h.fn);
            });
            await new Promise(() => {
                /* keep open */
            });
        });
    });
    return app;
}
let server = null;
export function startDashboard() {
    const token = resolveToken();
    if (!token) {
        logger.warn('DASHBOARD_TOKEN not set — dashboard disabled. `npm run setup` to add.');
        return;
    }
    const app = buildApp();
    server = serve({ fetch: app.fetch, port: DEFAULT_PORT, hostname: '127.0.0.1' });
    logger.info({ url: `http://localhost:${DEFAULT_PORT}/?token=${token.slice(0, 6)}…` }, 'dashboard online');
}
export function stopDashboard() {
    if (server) {
        server.close();
        server = null;
    }
}
//# sourceMappingURL=dashboard.js.map
#!/usr/bin/env node
// Minimal stdio MCP server that proxies queries to a running Howl PA
// dashboard. No DB access — the dashboard's /api/* endpoints already implement
// auth, paging, and JSON shaping, so we reuse them.
//
// Env:
//   HOWL_DASHBOARD_URL    default http://127.0.0.1:3141
//   HOWL_DASHBOARD_TOKEN  required; see howl-pa's .env (DASHBOARD_TOKEN)

import { createInterface } from 'node:readline'

const BASE = process.env.HOWL_DASHBOARD_URL ?? 'http://127.0.0.1:3141'
const TOKEN = process.env.HOWL_DASHBOARD_TOKEN ?? ''

const TOOLS = [
  {
    name: 'howl_status',
    description: 'Show Howl PA runtime status — uptime, conversation rows, memory chunks, audit rows.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_schedule_list',
    description: 'List all scheduled missions with next run, last result, and status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_recall',
    description: 'Recent memory chunks indexed from the vault + conversation log.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max rows (default 30)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'howl_subagents',
    description: 'Recent subagent dispatches with role, backend, outcome.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_routing_stats',
    description: 'Subagent routing by role (codex-corps taxonomy) over a rolling window.',
    inputSchema: {
      type: 'object',
      properties: { hours: { type: 'number', description: 'Window in hours (default 168)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'howl_audit',
    description: 'Recent audit-log entries (PIN attempts, blocks, exfil hits, commands).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_gmail',
    description: 'Last 50 ingested Gmail messages with importance scores.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_calendar',
    description: 'Upcoming Calendar events from -6h through +N hours (default 48).',
    inputSchema: {
      type: 'object',
      properties: { hours: { type: 'number', description: 'Look-ahead window in hours (default 48)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'howl_tasks',
    description: 'Google Tasks — local queue plus synced rows, ordered by status and due date.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_run_now',
    description: 'Run a scheduled mission immediately by schedule name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Schedule name' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_pause',
    description: 'Pause a scheduled mission by schedule name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Schedule name' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_resume',
    description: 'Resume a paused scheduled mission by schedule name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Schedule name' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_delete',
    description: 'Delete a scheduled mission by schedule name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Schedule name' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_schedule_add',
    description: 'Add a scheduled mission.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Schedule name' },
        mission: { type: 'string', description: 'Mission name' },
        schedule: { type: 'string', description: 'Cron schedule' },
        priority: { type: 'number', description: 'Optional priority' },
        args: { type: 'object', description: 'Optional mission arguments', additionalProperties: true },
      },
      required: ['name', 'mission', 'schedule'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_schedule_edit',
    description: 'Edit schedule, priority, args, or status for an existing scheduled mission.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Schedule name' },
        schedule: { type: 'string', description: 'New cron schedule' },
        priority: { type: 'number', description: 'New priority' },
        args: { type: 'object', description: 'New mission arguments', additionalProperties: true },
        status: { type: 'string', description: 'New schedule status' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_mission_adhoc',
    description: 'Queue an ad-hoc mission task.',
    inputSchema: {
      type: 'object',
      properties: {
        mission: { type: 'string', description: 'Mission name' },
        args: { type: 'object', description: 'Optional mission arguments', additionalProperties: true },
        title: { type: 'string', description: 'Optional task title' },
      },
      required: ['mission'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_mission_retry',
    description: 'Retry a mission task by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Mission task id' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_mission_cancel',
    description: 'Cancel a mission task by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Mission task id' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_capture',
    description: 'Capture text into Howl PA.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to capture' },
        kind: { type: 'string', description: 'Optional capture kind' },
        title: { type: 'string', description: 'Optional capture title' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_memory_list',
    description: 'List dashboard memory rows, optionally filtered by scope.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', description: 'Optional memory scope' } },
      additionalProperties: false,
    },
  },
  {
    name: 'howl_memory_set',
    description: 'Set a dashboard memory key.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Memory scope' },
        key: { type: 'string', description: 'Memory key' },
        value: { description: 'JSON-serializable memory value' },
      },
      required: ['scope', 'key', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_memory_delete',
    description: 'Delete a dashboard memory key.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Memory scope' },
        key: { type: 'string', description: 'Memory key' },
      },
      required: ['scope', 'key'],
      additionalProperties: false,
    },
  },
  {
    name: 'howl_health',
    description: 'Raw Howl PA health response.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_missions_catalog',
    description: 'List available mission definitions.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_capture_kinds',
    description: 'List supported capture kinds.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_events_test',
    description: 'Send a dashboard test event.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_whoami',
    description: 'Show the dashboard username and dashboard URL used by this MCP server.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'howl_transcript',
    description: 'Fetch a mission task or conversation transcript.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['mission_task', 'conversation'] },
        id: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
]

function authHeaders(extra = {}) {
  return { 'x-dashboard-token': TOKEN, ...extra }
}

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text.trim()) return {}
  return JSON.parse(text)
}

async function readResponseError(res) {
  const fallback = `HTTP ${res.status}`
  try {
    const text = await res.text()
    if (!text.trim()) return fallback
    const data = JSON.parse(text)
    if (data?.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
    return fallback
  } catch {
    return fallback
  }
}

async function fetchJson(path) {
  if (!TOKEN) throw new Error('HOWL_DASHBOARD_TOKEN is not set; cannot reach the howl-pa dashboard.')
  const url = new URL(path, BASE)
  url.searchParams.set('token', TOKEN)
  const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(5_000) })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return parseJsonResponse(res)
}

async function postJson(path, body = {}) {
  if (!TOKEN) throw new Error('HOWL_DASHBOARD_TOKEN is not set; cannot reach the howl-pa dashboard.')
  const url = new URL(path, BASE)
  url.searchParams.set('token', TOKEN)
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(await readResponseError(res))
  return parseJsonResponse(res)
}

async function patchJson(path, body = {}) {
  if (!TOKEN) throw new Error('HOWL_DASHBOARD_TOKEN is not set; cannot reach the howl-pa dashboard.')
  const url = new URL(path, BASE)
  url.searchParams.set('token', TOKEN)
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(await readResponseError(res))
  return parseJsonResponse(res)
}

async function deleteJson(path) {
  if (!TOKEN) throw new Error('HOWL_DASHBOARD_TOKEN is not set; cannot reach the howl-pa dashboard.')
  const url = new URL(path, BASE)
  url.searchParams.set('token', TOKEN)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(await readResponseError(res))
  return parseJsonResponse(res)
}

function hasArg(args, key) {
  return Object.prototype.hasOwnProperty.call(args ?? {}, key)
}

function requireStringArg(args, key, toolName) {
  const value = args?.[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${toolName} requires a non-empty ${key}`)
  }
  return value.trim()
}

function optionalStringArg(args, key, toolName) {
  const value = args?.[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${toolName} requires ${key} to be a non-empty string when provided`)
  }
  return value.trim()
}

function requireIntegerArg(args, key, toolName) {
  const raw = args?.[key]
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${toolName} requires a positive integer ${key}`)
  }
  return value
}

function optionalNumberArg(args, key, toolName) {
  const raw = args?.[key]
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(value)) {
    throw new Error(`${toolName} requires ${key} to be a finite number when provided`)
  }
  return value
}

function objectArg(args, key, toolName) {
  const value = args?.[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${toolName} requires ${key} to be an object when provided`)
  }
  return value
}

function requireValueArg(args, key, toolName) {
  if (!hasArg(args, key)) throw new Error(`${toolName} requires ${key}`)
  return args[key]
}

function requireTranscriptId(args) {
  const value = args?.id
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error('howl_transcript requires id to be a non-empty string or finite number')
}

function queryPath(path, params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

async function callTool(name, args) {
  switch (name) {
    case 'howl_status':
      return fetchJson('/api/health')
    case 'howl_schedule_list':
      return fetchJson('/api/scheduler')
    case 'howl_recall': {
      const data = await fetchJson('/api/memories')
      const limit = Math.min(Math.max(args?.limit ?? 30, 1), 200)
      return { rows: (data.rows ?? []).slice(0, limit) }
    }
    case 'howl_subagents':
      return fetchJson('/api/subagents')
    case 'howl_routing_stats': {
      const hours = Math.min(Math.max(args?.hours ?? 168, 1), 24 * 30)
      return fetchJson(`/api/roles?hours=${hours}`)
    }
    case 'howl_audit':
      return fetchJson('/api/audit')
    case 'howl_gmail':
      return fetchJson('/api/gmail')
    case 'howl_calendar': {
      const hours = Math.min(Math.max(args?.hours ?? 48, 1), 24 * 30)
      return fetchJson(`/api/calendar?hours=${hours}`)
    }
    case 'howl_tasks':
      return fetchJson('/api/tasks')
    case 'howl_run_now': {
      const scheduleName = requireStringArg(args, 'name', 'howl_run_now')
      return postJson(`/api/scheduler/${encodeURIComponent(scheduleName)}/run-now`, {})
    }
    case 'howl_pause': {
      const scheduleName = requireStringArg(args, 'name', 'howl_pause')
      return postJson(`/api/scheduler/${encodeURIComponent(scheduleName)}/pause`, {})
    }
    case 'howl_resume': {
      const scheduleName = requireStringArg(args, 'name', 'howl_resume')
      return postJson(`/api/scheduler/${encodeURIComponent(scheduleName)}/resume`, {})
    }
    case 'howl_delete': {
      const scheduleName = requireStringArg(args, 'name', 'howl_delete')
      return postJson(`/api/scheduler/${encodeURIComponent(scheduleName)}/delete`, {})
    }
    case 'howl_schedule_add': {
      const body = {
        name: requireStringArg(args, 'name', 'howl_schedule_add'),
        mission: requireStringArg(args, 'mission', 'howl_schedule_add'),
        schedule: requireStringArg(args, 'schedule', 'howl_schedule_add'),
      }
      if (hasArg(args, 'priority')) body.priority = optionalNumberArg(args, 'priority', 'howl_schedule_add')
      if (hasArg(args, 'args')) body.args = objectArg(args, 'args', 'howl_schedule_add')
      return postJson('/api/scheduler', body)
    }
    case 'howl_schedule_edit': {
      const scheduleName = requireStringArg(args, 'name', 'howl_schedule_edit')
      const body = {}
      if (hasArg(args, 'schedule')) body.schedule = optionalStringArg(args, 'schedule', 'howl_schedule_edit')
      if (hasArg(args, 'priority')) body.priority = optionalNumberArg(args, 'priority', 'howl_schedule_edit')
      if (hasArg(args, 'args')) body.args = objectArg(args, 'args', 'howl_schedule_edit')
      if (hasArg(args, 'status')) body.status = optionalStringArg(args, 'status', 'howl_schedule_edit')
      if (Object.keys(body).length === 0) {
        throw new Error('howl_schedule_edit requires at least one of schedule, priority, args, or status')
      }
      return patchJson(`/api/scheduler/${encodeURIComponent(scheduleName)}`, body)
    }
    case 'howl_mission_adhoc': {
      const body = { mission: requireStringArg(args, 'mission', 'howl_mission_adhoc') }
      if (hasArg(args, 'args')) body.args = objectArg(args, 'args', 'howl_mission_adhoc')
      if (hasArg(args, 'title')) body.title = optionalStringArg(args, 'title', 'howl_mission_adhoc')
      return postJson('/api/missions/adhoc', body)
    }
    case 'howl_mission_retry': {
      const id = requireIntegerArg(args, 'id', 'howl_mission_retry')
      return postJson(`/api/missions/${encodeURIComponent(String(id))}/retry`, {})
    }
    case 'howl_mission_cancel': {
      const id = requireIntegerArg(args, 'id', 'howl_mission_cancel')
      return postJson(`/api/missions/${encodeURIComponent(String(id))}/cancel`, {})
    }
    case 'howl_capture': {
      const body = { text: requireStringArg(args, 'text', 'howl_capture') }
      if (hasArg(args, 'kind')) body.kind = optionalStringArg(args, 'kind', 'howl_capture')
      if (hasArg(args, 'title')) body.title = optionalStringArg(args, 'title', 'howl_capture')
      return postJson('/api/capture', body)
    }
    case 'howl_memory_list': {
      const scope = hasArg(args, 'scope') ? optionalStringArg(args, 'scope', 'howl_memory_list') : undefined
      return fetchJson(queryPath('/api/memory', { scope }))
    }
    case 'howl_memory_set': {
      return postJson('/api/memory', {
        scope: requireStringArg(args, 'scope', 'howl_memory_set'),
        key: requireStringArg(args, 'key', 'howl_memory_set'),
        value: requireValueArg(args, 'value', 'howl_memory_set'),
      })
    }
    case 'howl_memory_delete': {
      const scope = requireStringArg(args, 'scope', 'howl_memory_delete')
      const key = requireStringArg(args, 'key', 'howl_memory_delete')
      return deleteJson(queryPath('/api/memory', { scope, key }))
    }
    case 'howl_health':
      return fetchJson('/api/health')
    case 'howl_missions_catalog':
      return fetchJson('/api/missions/catalog')
    case 'howl_capture_kinds':
      return fetchJson('/api/capture/kinds')
    case 'howl_events_test':
      return postJson('/api/events/test', {})
    case 'howl_whoami':
      return { username: process.env.DASHBOARD_USERNAME || 'howl', dashboard_url: BASE }
    case 'howl_transcript': {
      const kind = requireStringArg(args, 'kind', 'howl_transcript')
      if (kind !== 'mission_task' && kind !== 'conversation') {
        throw new Error('howl_transcript requires kind to be mission_task or conversation')
      }
      return fetchJson(queryPath('/api/transcript', { kind, id: requireTranscriptId(args) }))
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

async function dispatch(msg) {
  const { id, method, params } = msg
  try {
    if (method === 'initialize') {
      return reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'howl-pa', version: '0.0.8' },
      })
    }
    if (method === 'tools/list') {
      return reply(id, { tools: TOOLS })
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = params ?? {}
      const result = await callTool(name, args)
      return reply(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      })
    }
    if (method === 'ping') return reply(id, {})
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return
    return replyError(id, -32601, `method not found: ${method}`)
  } catch (err) {
    return replyError(id, -32000, err instanceof Error ? err.message : String(err))
  }
}

const rl = createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    const msg = JSON.parse(trimmed)
    void dispatch(msg)
  } catch (err) {
    process.stderr.write(`howl-pa mcp: bad frame — ${err instanceof Error ? err.message : String(err)}\n`)
  }
})

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

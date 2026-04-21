#!/usr/bin/env node
// Minimal stdio MCP server that proxies read-only queries to a running Howl PA
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
]

async function fetchJson(path) {
  if (!TOKEN) throw new Error('HOWL_DASHBOARD_TOKEN is not set; cannot reach the howl-pa dashboard.')
  const url = new URL(path, BASE)
  url.searchParams.set('token', TOKEN)
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
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
        serverInfo: { name: 'howl-pa', version: '0.0.6' },
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

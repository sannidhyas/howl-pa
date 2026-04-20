import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DB_PATH } from './config.js'
import { logger } from './logger.js'

let db: DatabaseSync | null = null

export function initDatabase(): DatabaseSync {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')

  applySchema(db)
  logger.info({ path: DB_PATH }, 'db initialised')
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('db not initialised — call initDatabase() first')
  return db
}

function applySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'main',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      last_used_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      metadata TEXT,
      PRIMARY KEY (id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_chat ON sessions(chat_id, agent_id, last_used_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT 'main',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_convo_session ON conversation_log(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_convo_chat ON conversation_log(chat_id, created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_log_fts USING fts5(
      content,
      content='conversation_log',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS conversation_log_ai AFTER INSERT ON conversation_log BEGIN
      INSERT INTO conversation_log_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS conversation_log_ad AFTER DELETE ON conversation_log BEGIN
      INSERT INTO conversation_log_fts(conversation_log_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS conversation_log_au AFTER UPDATE ON conversation_log BEGIN
      INSERT INTO conversation_log_fts(conversation_log_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO conversation_log_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      chat_id TEXT,
      agent_id TEXT NOT NULL DEFAULT 'main',
      backend TEXT NOT NULL DEFAULT 'claude',
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_chat ON token_usage(chat_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS session_summaries (
      session_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS compaction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      kept_messages INTEGER,
      dropped_messages INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS skill_health (
      skill_id TEXT PRIMARY KEY,
      last_check_at INTEGER,
      status TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS skill_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      chat_id TEXT,
      duration_ms INTEGER,
      outcome TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      agent_id TEXT NOT NULL DEFAULT 'main',
      event_type TEXT NOT NULL,
      detail TEXT,
      blocked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_chat ON audit_log(chat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS memory_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_kind TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      chunk_idx INTEGER NOT NULL DEFAULT 0,
      chunk TEXT NOT NULL,
      embedding BLOB NOT NULL,
      mtime INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(source_kind, source_ref, chunk_idx)
    );

    CREATE INDEX IF NOT EXISTS idx_mc_source ON memory_chunks(source_kind, source_ref);
    CREATE INDEX IF NOT EXISTS idx_mc_mtime ON memory_chunks(source_kind, mtime);

    CREATE TABLE IF NOT EXISTS subagent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      mode TEXT NOT NULL,
      backend TEXT NOT NULL,
      judge TEXT,
      hints TEXT,
      prompt_preview TEXT,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      outcome TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_sar_backend ON subagent_runs(backend, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sar_mode ON subagent_runs(mode, created_at DESC);

    CREATE TABLE IF NOT EXISTS mirror_state (
      source_path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      vault_path TEXT NOT NULL,
      kind TEXT,
      summary_model TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      mission TEXT NOT NULL,
      schedule TEXT NOT NULL,
      next_run INTEGER NOT NULL,
      last_run INTEGER,
      last_result TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      agent_id TEXT NOT NULL DEFAULT 'main',
      status TEXT NOT NULL DEFAULT 'active',
      args TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_sched_status_next ON scheduled_tasks(status, priority, next_run);

    CREATE TABLE IF NOT EXISTS mission_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      prompt TEXT,
      mission TEXT,
      assigned_agent TEXT NOT NULL DEFAULT 'main',
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      result TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_mission_status ON mission_tasks(status, priority, created_at);
  `)
}

export function getMirrorState(sourcePath: string): { mtime: number; vault_path: string } | null {
  const row = getDb()
    .prepare(`SELECT mtime, vault_path FROM mirror_state WHERE source_path = ?`)
    .get(sourcePath) as { mtime: number; vault_path: string } | undefined
  return row ?? null
}

export function upsertMirrorState(args: {
  sourcePath: string
  mtime: number
  vaultPath: string
  kind?: string
  summaryModel?: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO mirror_state (source_path, mtime, vault_path, kind, summary_model, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%s','now') * 1000)
       ON CONFLICT(source_path) DO UPDATE SET
         mtime=excluded.mtime,
         vault_path=excluded.vault_path,
         kind=excluded.kind,
         summary_model=excluded.summary_model,
         updated_at=strftime('%s','now') * 1000`
    )
    .run(args.sourcePath, args.mtime, args.vaultPath, args.kind ?? null, args.summaryModel ?? null)
}

// Session helpers ----------------------------------------------------------

export function upsertSession(sessionId: string, chatId: string, agentId = 'main'): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (id, chat_id, agent_id, created_at, last_used_at)
       VALUES (?, ?, ?, strftime('%s','now') * 1000, strftime('%s','now') * 1000)
       ON CONFLICT(id, agent_id) DO UPDATE SET last_used_at = strftime('%s','now') * 1000`
    )
    .run(sessionId, chatId, agentId)
}

export function latestSessionFor(chatId: string, agentId = 'main'): string | null {
  const row = getDb()
    .prepare(
      `SELECT id FROM sessions WHERE chat_id = ? AND agent_id = ?
       ORDER BY last_used_at DESC LIMIT 1`
    )
    .get(chatId, agentId) as { id?: string } | undefined
  return row?.id ?? null
}

// Conversation helpers ----------------------------------------------------

export function appendConversation(
  sessionId: string,
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agentId = 'main'
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO conversation_log (session_id, chat_id, agent_id, role, content) VALUES (?, ?, ?, ?, ?)`
    )
    .run(sessionId, chatId, agentId, role, content)
  return Number(info.lastInsertRowid)
}

export type ConversationRow = {
  id: number
  session_id: string
  chat_id: string
  agent_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: number
}

export function recentConversation(chatId: string, limit = 20): ConversationRow[] {
  return getDb()
    .prepare(
      `SELECT id, session_id, chat_id, agent_id, role, content, created_at
       FROM conversation_log WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(chatId, limit) as ConversationRow[]
}

// Token usage -------------------------------------------------------------

export type TokenUsageEntry = {
  sessionId?: string
  chatId?: string
  agentId?: string
  backend?: 'claude' | 'codex'
  model?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
}

export function recordTokenUsage(entry: TokenUsageEntry): void {
  getDb()
    .prepare(
      `INSERT INTO token_usage (session_id, chat_id, agent_id, backend, model, input_tokens, output_tokens, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.sessionId ?? null,
      entry.chatId ?? null,
      entry.agentId ?? 'main',
      entry.backend ?? 'claude',
      entry.model ?? null,
      entry.inputTokens ?? 0,
      entry.outputTokens ?? 0,
      entry.durationMs ?? null
    )
}

// Audit -------------------------------------------------------------------

export type AuditEventType =
  | 'message'
  | 'command'
  | 'delegation'
  | 'unlock'
  | 'lock'
  | 'kill'
  | 'blocked'
  | 'exfil_redacted'
  | 'capture'

export function audit(
  eventType: AuditEventType,
  detail: string,
  opts: { chatId?: string; agentId?: string; blocked?: boolean } = {}
): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (chat_id, agent_id, event_type, detail, blocked)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      opts.chatId ?? null,
      opts.agentId ?? 'main',
      eventType,
      detail,
      opts.blocked ? 1 : 0
    )
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// Memory chunks (vector store) -------------------------------------------

export type MemorySourceKind = 'vault' | 'convo' | 'idea' | 'fragment'

export type MemoryChunkRow = {
  id: number
  source_kind: MemorySourceKind
  source_ref: string
  chunk_idx: number
  chunk: string
  embedding: Uint8Array
  mtime: number | null
  created_at: number
}

export function upsertMemoryChunk(args: {
  sourceKind: MemorySourceKind
  sourceRef: string
  chunkIdx: number
  chunk: string
  embedding: Uint8Array
  mtime?: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO memory_chunks (source_kind, source_ref, chunk_idx, chunk, embedding, mtime)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_kind, source_ref, chunk_idx) DO UPDATE SET
         chunk=excluded.chunk, embedding=excluded.embedding, mtime=excluded.mtime`
    )
    .run(
      args.sourceKind,
      args.sourceRef,
      args.chunkIdx,
      args.chunk,
      args.embedding,
      args.mtime ?? null
    )
}

export function memoryChunkMtime(kind: MemorySourceKind, ref: string): number | null {
  const row = getDb()
    .prepare(`SELECT MAX(mtime) AS mtime FROM memory_chunks WHERE source_kind = ? AND source_ref = ?`)
    .get(kind, ref) as { mtime: number | null } | undefined
  return row?.mtime ?? null
}

export function deleteMemoryChunksFor(kind: MemorySourceKind, ref: string): void {
  getDb().prepare(`DELETE FROM memory_chunks WHERE source_kind = ? AND source_ref = ?`).run(kind, ref)
}

export function allMemoryChunks(kind?: MemorySourceKind): MemoryChunkRow[] {
  const stmt = kind
    ? getDb().prepare(
        `SELECT id, source_kind, source_ref, chunk_idx, chunk, embedding, mtime, created_at
         FROM memory_chunks WHERE source_kind = ?`
      )
    : getDb().prepare(
        `SELECT id, source_kind, source_ref, chunk_idx, chunk, embedding, mtime, created_at
         FROM memory_chunks`
      )
  return (kind ? stmt.all(kind) : stmt.all()) as MemoryChunkRow[]
}

// Subagent telemetry ------------------------------------------------------

export type SubagentRunEntry = {
  chatId?: string
  mode: 'single' | 'council'
  backend: string
  judge?: string
  hints?: string
  promptPreview?: string
  durationMs?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  outcome: 'ok' | 'error' | 'timeout' | 'partial'
}

export function recordSubagentRun(entry: SubagentRunEntry): void {
  getDb()
    .prepare(
      `INSERT INTO subagent_runs (chat_id, mode, backend, judge, hints, prompt_preview, duration_ms, input_tokens, output_tokens, cost_usd, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.chatId ?? null,
      entry.mode,
      entry.backend,
      entry.judge ?? null,
      entry.hints ?? null,
      entry.promptPreview ?? null,
      entry.durationMs ?? null,
      entry.inputTokens ?? null,
      entry.outputTokens ?? null,
      entry.costUsd ?? null,
      entry.outcome
    )
}

// Scheduled tasks --------------------------------------------------------

export type ScheduledTaskStatus = 'active' | 'paused' | 'running' | 'stuck' | 'disabled'

export type ScheduledTaskRow = {
  id: number
  name: string
  mission: string
  schedule: string
  next_run: number
  last_run: number | null
  last_result: string | null
  priority: number
  agent_id: string
  status: ScheduledTaskStatus
  args: string | null
  created_at: number
}

export function upsertScheduledTask(args: {
  name: string
  mission: string
  schedule: string
  nextRun: number
  priority?: number
  agentId?: string
  status?: ScheduledTaskStatus
  args?: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO scheduled_tasks (name, mission, schedule, next_run, priority, agent_id, status, args)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         mission=excluded.mission,
         schedule=excluded.schedule,
         next_run=excluded.next_run,
         priority=excluded.priority,
         agent_id=excluded.agent_id,
         args=excluded.args`
    )
    .run(
      args.name,
      args.mission,
      args.schedule,
      args.nextRun,
      args.priority ?? 0,
      args.agentId ?? 'main',
      args.status ?? 'active',
      args.args ?? null
    )
}

export function listScheduledTasks(): ScheduledTaskRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, agent_id, status, args, created_at
       FROM scheduled_tasks ORDER BY next_run`
    )
    .all() as ScheduledTaskRow[]
}

export function dueScheduledTasks(now = Date.now()): ScheduledTaskRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, agent_id, status, args, created_at
       FROM scheduled_tasks
       WHERE status = 'active' AND next_run <= ?
       ORDER BY priority DESC, next_run`
    )
    .all(now) as ScheduledTaskRow[]
}

export function markTaskRunning(id: number): void {
  getDb()
    .prepare(`UPDATE scheduled_tasks SET status='running' WHERE id = ?`)
    .run(id)
}

export function markTaskRan(args: {
  id: number
  nextRun: number
  lastResult: string
  status?: ScheduledTaskStatus
}): void {
  getDb()
    .prepare(
      `UPDATE scheduled_tasks SET last_run = strftime('%s','now') * 1000, last_result = ?, next_run = ?, status = ? WHERE id = ?`
    )
    .run(args.lastResult, args.nextRun, args.status ?? 'active', args.id)
}

export function setTaskStatus(name: string, status: ScheduledTaskStatus): boolean {
  const info = getDb().prepare(`UPDATE scheduled_tasks SET status = ? WHERE name = ?`).run(status, name)
  return info.changes > 0
}

export function deleteScheduledTask(name: string): boolean {
  const info = getDb().prepare(`DELETE FROM scheduled_tasks WHERE name = ?`).run(name)
  return info.changes > 0
}

export function recoverStuckTasks(timeoutMs: number): number {
  const info = getDb()
    .prepare(
      `UPDATE scheduled_tasks SET status='stuck' WHERE status='running' AND last_run IS NOT NULL AND last_run < ?`
    )
    .run(Date.now() - timeoutMs)
  return Number(info.changes)
}

// Mission tasks (queue) --------------------------------------------------

export type MissionTaskStatus = 'queued' | 'running' | 'done' | 'failed'

export type MissionTaskRow = {
  id: number
  title: string
  prompt: string | null
  mission: string | null
  assigned_agent: string
  priority: number
  status: MissionTaskStatus
  result: string | null
  started_at: number | null
  completed_at: number | null
  created_at: number
}

export function enqueueMission(args: {
  title: string
  prompt?: string
  mission?: string
  assignedAgent?: string
  priority?: number
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO mission_tasks (title, prompt, mission, assigned_agent, priority)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      args.title,
      args.prompt ?? null,
      args.mission ?? null,
      args.assignedAgent ?? 'main',
      args.priority ?? 0
    )
  return Number(info.lastInsertRowid)
}

export function listMissionTasks(status?: MissionTaskStatus, limit = 20): MissionTaskRow[] {
  if (status) {
    return getDb()
      .prepare(
        `SELECT id, title, prompt, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
         FROM mission_tasks WHERE status = ? ORDER BY priority DESC, created_at LIMIT ?`
      )
      .all(status, limit) as MissionTaskRow[]
  }
  return getDb()
    .prepare(
      `SELECT id, title, prompt, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
       FROM mission_tasks ORDER BY priority DESC, created_at DESC LIMIT ?`
    )
    .all(limit) as MissionTaskRow[]
}

export function updateMissionTaskStatus(
  id: number,
  status: MissionTaskStatus,
  result?: string
): void {
  getDb()
    .prepare(
      `UPDATE mission_tasks SET status = ?, result = COALESCE(?, result),
         started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN strftime('%s','now')*1000 ELSE started_at END,
         completed_at = CASE WHEN ? IN ('done','failed') THEN strftime('%s','now')*1000 ELSE completed_at END
       WHERE id = ?`
    )
    .run(status, result ?? null, status, status, id)
}

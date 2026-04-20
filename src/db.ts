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
  `)
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

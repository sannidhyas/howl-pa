import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { DB_PATH, PROJECT_ROOT, STORE_DIR } from './config.js';
import { logger } from './logger.js';
let db = null;
function isNodeError(error) {
    return error instanceof Error;
}
function copyDirectorySync(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirectorySync(srcPath, destPath);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        copyFileSync(srcPath, destPath);
    }
}
export function initDatabase() {
    if (db)
        return db;
    const legacyStoreDir = join(PROJECT_ROOT, 'store');
    if (existsSync(join(legacyStoreDir, 'howl.db')) && !existsSync(DB_PATH)) {
        mkdirSync(dirname(STORE_DIR), { recursive: true });
        try {
            renameSync(legacyStoreDir, STORE_DIR);
        }
        catch (error) {
            if (!isNodeError(error) || error.code !== 'EXDEV')
                throw error;
            copyDirectorySync(legacyStoreDir, STORE_DIR);
            rmSync(legacyStoreDir, { recursive: true });
        }
        logger.warn({ src: legacyStoreDir, dest: STORE_DIR }, 'migrated legacy store');
    }
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA synchronous = NORMAL');
    applySchema(db);
    logger.info({ path: DB_PATH }, 'db initialised');
    return db;
}
export function getDb() {
    if (!db)
        throw new Error('db not initialised — call initDatabase() first');
    return db;
}
function applySchema(db) {
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

    CREATE TABLE IF NOT EXISTS gmail_items (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      sender TEXT,
      subject TEXT,
      snippet TEXT,
      internal_date INTEGER,
      labels TEXT,
      unread INTEGER NOT NULL DEFAULT 1,
      importance INTEGER,
      importance_reason TEXT,
      classified_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_gmail_internal_date ON gmail_items(internal_date DESC);
    CREATE INDEX IF NOT EXISTS idx_gmail_importance ON gmail_items(importance DESC, internal_date DESC);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      summary TEXT,
      location TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      html_link TEXT,
      meet_link TEXT,
      attendees TEXT,
      description TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_cal_starts ON calendar_events(starts_at);

    CREATE TABLE IF NOT EXISTS tasks_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL DEFAULT '@default',
      title TEXT NOT NULL,
      notes TEXT,
      due_ts INTEGER,
      status TEXT NOT NULL DEFAULT 'needs_push',
      updated_at INTEGER,
      synced_at INTEGER,
      importance INTEGER,
      importance_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks_items(status, due_ts);
    CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks_items(list_id, updated_at DESC);
  `);
    db.exec(`DROP TABLE IF EXISTS wa_messages`);
    db.exec(`DROP TABLE IF EXISTS wa_allowlist`);
    // Inline column migrations for pre-existing DBs. Adding columns is safe
    // because SQLite appends; data stays intact.
    const gmailCols = db.prepare(`PRAGMA table_info(gmail_items)`).all().map(r => r.name);
    if (!gmailCols.includes('importance'))
        db.exec(`ALTER TABLE gmail_items ADD COLUMN importance INTEGER`);
    if (!gmailCols.includes('importance_reason'))
        db.exec(`ALTER TABLE gmail_items ADD COLUMN importance_reason TEXT`);
    if (!gmailCols.includes('classified_at'))
        db.exec(`ALTER TABLE gmail_items ADD COLUMN classified_at INTEGER`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gmail_importance ON gmail_items(importance DESC, internal_date DESC)`);
    const taskCols = db.prepare(`PRAGMA table_info(tasks_items)`).all().map(r => r.name);
    if (!taskCols.includes('importance'))
        db.exec(`ALTER TABLE tasks_items ADD COLUMN importance INTEGER`);
    if (!taskCols.includes('importance_reason'))
        db.exec(`ALTER TABLE tasks_items ADD COLUMN importance_reason TEXT`);
    const sarCols = db.prepare(`PRAGMA table_info(subagent_runs)`).all().map(r => r.name);
    if (!sarCols.includes('role'))
        db.exec(`ALTER TABLE subagent_runs ADD COLUMN role TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sar_role ON subagent_runs(role, created_at DESC)`);
}
export function getMirrorState(sourcePath) {
    const row = getDb()
        .prepare(`SELECT mtime, vault_path FROM mirror_state WHERE source_path = ?`)
        .get(sourcePath);
    return row ?? null;
}
export function upsertMirrorState(args) {
    getDb()
        .prepare(`INSERT INTO mirror_state (source_path, mtime, vault_path, kind, summary_model, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%s','now') * 1000)
       ON CONFLICT(source_path) DO UPDATE SET
         mtime=excluded.mtime,
         vault_path=excluded.vault_path,
         kind=excluded.kind,
         summary_model=excluded.summary_model,
         updated_at=strftime('%s','now') * 1000`)
        .run(args.sourcePath, args.mtime, args.vaultPath, args.kind ?? null, args.summaryModel ?? null);
}
// Session helpers ----------------------------------------------------------
export function upsertSession(sessionId, chatId, agentId = 'main') {
    getDb()
        .prepare(`INSERT INTO sessions (id, chat_id, agent_id, created_at, last_used_at)
       VALUES (?, ?, ?, strftime('%s','now') * 1000, strftime('%s','now') * 1000)
       ON CONFLICT(id, agent_id) DO UPDATE SET last_used_at = strftime('%s','now') * 1000`)
        .run(sessionId, chatId, agentId);
}
export function latestSessionFor(chatId, agentId = 'main') {
    const row = getDb()
        .prepare(`SELECT id FROM sessions WHERE chat_id = ? AND agent_id = ?
       ORDER BY last_used_at DESC LIMIT 1`)
        .get(chatId, agentId);
    return row?.id ?? null;
}
// Conversation helpers ----------------------------------------------------
export function appendConversation(sessionId, chatId, role, content, agentId = 'main') {
    const info = getDb()
        .prepare(`INSERT INTO conversation_log (session_id, chat_id, agent_id, role, content) VALUES (?, ?, ?, ?, ?)`)
        .run(sessionId, chatId, agentId, role, content);
    return Number(info.lastInsertRowid);
}
export function recentConversation(chatId, limit = 20) {
    return getDb()
        .prepare(`SELECT id, session_id, chat_id, agent_id, role, content, created_at
       FROM conversation_log WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`)
        .all(chatId, limit);
}
export function recordTokenUsage(entry) {
    getDb()
        .prepare(`INSERT INTO token_usage (session_id, chat_id, agent_id, backend, model, input_tokens, output_tokens, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(entry.sessionId ?? null, entry.chatId ?? null, entry.agentId ?? 'main', entry.backend ?? 'claude', entry.model ?? null, entry.inputTokens ?? 0, entry.outputTokens ?? 0, entry.durationMs ?? null);
}
export function audit(eventType, detail, opts = {}) {
    getDb()
        .prepare(`INSERT INTO audit_log (chat_id, agent_id, event_type, detail, blocked)
       VALUES (?, ?, ?, ?, ?)`)
        .run(opts.chatId ?? null, opts.agentId ?? 'main', eventType, detail, opts.blocked ? 1 : 0);
}
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
export function upsertMemoryChunk(args) {
    getDb()
        .prepare(`INSERT INTO memory_chunks (source_kind, source_ref, chunk_idx, chunk, embedding, mtime)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_kind, source_ref, chunk_idx) DO UPDATE SET
         chunk=excluded.chunk, embedding=excluded.embedding, mtime=excluded.mtime`)
        .run(args.sourceKind, args.sourceRef, args.chunkIdx, args.chunk, args.embedding, args.mtime ?? null);
}
export function memoryChunkMtime(kind, ref) {
    const row = getDb()
        .prepare(`SELECT MAX(mtime) AS mtime FROM memory_chunks WHERE source_kind = ? AND source_ref = ?`)
        .get(kind, ref);
    return row?.mtime ?? null;
}
export function deleteMemoryChunksFor(kind, ref) {
    getDb().prepare(`DELETE FROM memory_chunks WHERE source_kind = ? AND source_ref = ?`).run(kind, ref);
}
export function allMemoryChunks(kind) {
    const stmt = kind
        ? getDb().prepare(`SELECT id, source_kind, source_ref, chunk_idx, chunk, embedding, mtime, created_at
         FROM memory_chunks WHERE source_kind = ?`)
        : getDb().prepare(`SELECT id, source_kind, source_ref, chunk_idx, chunk, embedding, mtime, created_at
         FROM memory_chunks`);
    return (kind ? stmt.all(kind) : stmt.all());
}
export function recordSubagentRun(entry) {
    getDb()
        .prepare(`INSERT INTO subagent_runs (chat_id, mode, backend, role, judge, hints, prompt_preview, duration_ms, input_tokens, output_tokens, cost_usd, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(entry.chatId ?? null, entry.mode, entry.backend, entry.role ?? null, entry.judge ?? null, entry.hints ?? null, entry.promptPreview ?? null, entry.durationMs ?? null, entry.inputTokens ?? null, entry.outputTokens ?? null, entry.costUsd ?? null, entry.outcome);
}
export function roleStats(sinceMs) {
    return getDb()
        .prepare(`SELECT COALESCE(role, 'unknown') AS role,
              COUNT(*) AS n,
              SUM(CASE WHEN outcome = 'ok' THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN outcome IN ('error','timeout') THEN 1 ELSE 0 END) AS err,
              AVG(duration_ms) AS avg_ms
         FROM subagent_runs
         WHERE created_at >= ?
         GROUP BY COALESCE(role, 'unknown')
         ORDER BY n DESC`)
        .all(sinceMs);
}
export function upsertScheduledTask(args) {
    getDb()
        .prepare(`INSERT INTO scheduled_tasks (name, mission, schedule, next_run, priority, agent_id, status, args)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         mission=excluded.mission,
         schedule=excluded.schedule,
         next_run=excluded.next_run,
         priority=excluded.priority,
         agent_id=excluded.agent_id,
         args=excluded.args`)
        .run(args.name, args.mission, args.schedule, args.nextRun, args.priority ?? 0, args.agentId ?? 'main', args.status ?? 'active', args.args ?? null);
}
export function listScheduledTasks() {
    return getDb()
        .prepare(`SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, agent_id, status, args, created_at
       FROM scheduled_tasks ORDER BY next_run`)
        .all();
}
export function dueScheduledTasks(now = Date.now()) {
    return getDb()
        .prepare(`SELECT id, name, mission, schedule, next_run, last_run, last_result, priority, agent_id, status, args, created_at
       FROM scheduled_tasks
       WHERE status = 'active' AND next_run <= ?
       ORDER BY priority DESC, next_run`)
        .all(now);
}
export function markTaskRunning(id) {
    getDb()
        .prepare(`UPDATE scheduled_tasks
       SET status='running', last_run = strftime('%s','now') * 1000
       WHERE id = ?`)
        .run(id);
}
export function markTaskRan(args) {
    getDb()
        .prepare(`UPDATE scheduled_tasks SET last_run = strftime('%s','now') * 1000, last_result = ?, next_run = ?, status = ? WHERE id = ?`)
        .run(args.lastResult, args.nextRun, args.status ?? 'active', args.id);
}
export function setTaskStatus(name, status) {
    const info = getDb().prepare(`UPDATE scheduled_tasks SET status = ? WHERE name = ?`).run(status, name);
    return info.changes > 0;
}
export function deleteScheduledTask(name) {
    const info = getDb().prepare(`DELETE FROM scheduled_tasks WHERE name = ?`).run(name);
    return info.changes > 0;
}
export function recoverStuckTasks(timeoutMs) {
    const info = getDb()
        .prepare(`UPDATE scheduled_tasks
       SET status='active',
           next_run=strftime('%s','now') * 1000,
           last_result='recovered: previous run did not finish'
       WHERE status='running' AND (last_run IS NULL OR last_run < ?)`)
        .run(Date.now() - timeoutMs);
    return Number(info.changes);
}
export function enqueueMission(args) {
    const info = getDb()
        .prepare(`INSERT INTO mission_tasks (title, prompt, mission, assigned_agent, priority)
       VALUES (?, ?, ?, ?, ?)`)
        .run(args.title, args.prompt ?? null, args.mission ?? null, args.assignedAgent ?? 'main', args.priority ?? 0);
    return Number(info.lastInsertRowid);
}
export function listMissionTasks(status, limit = 20) {
    if (status) {
        return getDb()
            .prepare(`SELECT id, title, prompt, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
         FROM mission_tasks WHERE status = ? ORDER BY priority DESC, created_at LIMIT ?`)
            .all(status, limit);
    }
    return getDb()
        .prepare(`SELECT id, title, prompt, mission, assigned_agent, priority, status, result, started_at, completed_at, created_at
       FROM mission_tasks ORDER BY priority DESC, created_at DESC LIMIT ?`)
        .all(limit);
}
export function updateMissionTaskStatus(id, status, result) {
    getDb()
        .prepare(`UPDATE mission_tasks SET status = ?, result = COALESCE(?, result),
         started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN strftime('%s','now')*1000 ELSE started_at END,
         completed_at = CASE WHEN ? IN ('done','failed','cancelled') THEN strftime('%s','now')*1000 ELSE completed_at END
       WHERE id = ?`)
        .run(status, result ?? null, status, status, id);
}
export function upsertGmailItem(item) {
    getDb()
        .prepare(`INSERT INTO gmail_items (id, thread_id, sender, subject, snippet, internal_date, labels, unread)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         thread_id=excluded.thread_id, sender=excluded.sender, subject=excluded.subject,
         snippet=excluded.snippet, internal_date=excluded.internal_date, labels=excluded.labels,
         unread=excluded.unread`)
        .run(item.id, item.threadId ?? null, item.sender ?? null, item.subject ?? null, item.snippet ?? null, item.internalDate ?? null, item.labels ? JSON.stringify(item.labels) : null, item.unread === false ? 0 : 1);
}
export function listGmailSince(sinceMs, limit = 20) {
    return getDb()
        .prepare(`SELECT id, thread_id, sender, subject, snippet, internal_date, labels, unread,
              importance, importance_reason, classified_at, created_at
       FROM gmail_items WHERE internal_date >= ? ORDER BY internal_date DESC LIMIT ?`)
        .all(sinceMs, limit);
}
export function listGmailUnclassified(limit = 25) {
    return getDb()
        .prepare(`SELECT id, thread_id, sender, subject, snippet, internal_date, labels, unread,
              importance, importance_reason, classified_at, created_at
       FROM gmail_items WHERE importance IS NULL
       ORDER BY internal_date DESC LIMIT ?`)
        .all(limit);
}
export function topGmailByImportance(sinceMs, limit = 10) {
    return getDb()
        .prepare(`SELECT id, thread_id, sender, subject, snippet, internal_date, labels, unread,
              importance, importance_reason, classified_at, created_at
       FROM gmail_items
       WHERE internal_date >= ? AND importance IS NOT NULL
       ORDER BY importance DESC, internal_date DESC LIMIT ?`)
        .all(sinceMs, limit);
}
export function markGmailImportance(id, importance, reason) {
    getDb()
        .prepare(`UPDATE gmail_items SET importance = ?, importance_reason = ?, classified_at = strftime('%s','now') * 1000 WHERE id = ?`)
        .run(Math.max(0, Math.min(100, Math.round(importance))), reason.slice(0, 240), id);
}
export function upsertCalendarEvent(ev) {
    getDb()
        .prepare(`INSERT INTO calendar_events (id, summary, location, starts_at, ends_at, html_link, meet_link, attendees, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
       ON CONFLICT(id) DO UPDATE SET
         summary=excluded.summary, location=excluded.location, starts_at=excluded.starts_at,
         ends_at=excluded.ends_at, html_link=excluded.html_link, meet_link=excluded.meet_link,
         attendees=excluded.attendees, description=excluded.description,
         updated_at=strftime('%s','now') * 1000`)
        .run(ev.id, ev.summary ?? null, ev.location ?? null, ev.startsAt ?? null, ev.endsAt ?? null, ev.htmlLink ?? null, ev.meetLink ?? null, ev.attendees ? JSON.stringify(ev.attendees) : null, ev.description ?? null);
}
export function listCalendarEventsBetween(fromMs, toMs) {
    return getDb()
        .prepare(`SELECT id, summary, location, starts_at, ends_at, html_link, meet_link, attendees, description, updated_at
       FROM calendar_events WHERE starts_at >= ? AND starts_at < ? ORDER BY starts_at`)
        .all(fromMs, toMs);
}
export function upsertTaskItem(item) {
    getDb()
        .prepare(`INSERT INTO tasks_items (id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         list_id=excluded.list_id,
         title=excluded.title,
         notes=excluded.notes,
         due_ts=excluded.due_ts,
         status=excluded.status,
         updated_at=excluded.updated_at,
         synced_at=excluded.synced_at,
         importance=excluded.importance,
         importance_reason=excluded.importance_reason`)
        .run(item.id, item.listId ?? '@default', item.title, item.notes ?? null, item.dueTs ?? null, item.status ?? 'needs_push', item.updatedAt ?? Date.now(), item.syncedAt ?? null, item.importance ?? null, item.importanceReason ?? null);
}
export function deleteTaskItem(id) {
    getDb().prepare(`DELETE FROM tasks_items WHERE id = ?`).run(id);
}
export function listTaskItems(status, limit = 25) {
    if (status) {
        return getDb()
            .prepare(`SELECT id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason
         FROM tasks_items WHERE status = ? ORDER BY COALESCE(due_ts, updated_at) ASC LIMIT ?`)
            .all(status, limit);
    }
    return getDb()
        .prepare(`SELECT id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason
       FROM tasks_items ORDER BY
         CASE status WHEN 'needs_push' THEN 0 WHEN 'needs_sync' THEN 1 WHEN 'needsAction' THEN 2 ELSE 3 END,
         COALESCE(due_ts, updated_at) ASC LIMIT ?`)
        .all(limit);
}
export function pendingTaskItems(limit = 50) {
    return getDb()
        .prepare(`SELECT id, list_id, title, notes, due_ts, status, updated_at, synced_at, importance, importance_reason
       FROM tasks_items WHERE status IN ('needs_push', 'needs_sync')
       ORDER BY updated_at ASC LIMIT ?`)
        .all(limit);
}
//# sourceMappingURL=db.js.map
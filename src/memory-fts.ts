import { getDb } from './db.js'

export type FtsHit = {
  id: number
  sessionId: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  rank: number
  createdAt: number
}

// Escape FTS5 tokens. User input may contain operators — quote each term to
// prevent injection. Multi-word query → AND by whitespace.
function escapeFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter(tok => tok.length > 0)
    .map(tok => `"${tok.replace(/"/g, '""')}"`)
    .join(' ')
}

export function queryFts(term: string, limit = 10, chatId?: string): FtsHit[] {
  const escaped = escapeFtsQuery(term)
  if (!escaped) return []
  const db = getDb()
  if (chatId) {
    return db
      .prepare(
        `SELECT c.id, c.session_id, c.chat_id, c.role, c.content, c.created_at, bm25(conversation_log_fts) AS rank
         FROM conversation_log_fts
         JOIN conversation_log c ON c.id = conversation_log_fts.rowid
         WHERE conversation_log_fts MATCH ? AND c.chat_id = ?
         ORDER BY rank LIMIT ?`
      )
      .all(escaped, chatId, limit)
      .map(mapRow)
  }
  return db
    .prepare(
      `SELECT c.id, c.session_id, c.chat_id, c.role, c.content, c.created_at, bm25(conversation_log_fts) AS rank
       FROM conversation_log_fts
       JOIN conversation_log c ON c.id = conversation_log_fts.rowid
       WHERE conversation_log_fts MATCH ?
       ORDER BY rank LIMIT ?`
    )
    .all(escaped, limit)
    .map(mapRow)
}

function mapRow(raw: unknown): FtsHit {
  const row = raw as {
    id: number
    session_id: string
    chat_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    rank: number
    created_at: number
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    rank: row.rank,
    createdAt: row.created_at,
  }
}

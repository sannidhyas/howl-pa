import { getDb } from './db.js';
// Escape FTS5 tokens. User input may contain operators — quote each term to
// prevent injection. Multi-word query → AND by whitespace.
function escapeFtsQuery(q) {
    return q
        .split(/\s+/)
        .filter(tok => tok.length > 0)
        .map(tok => `"${tok.replace(/"/g, '""')}"`)
        .join(' ');
}
export function queryFts(term, limit = 10, chatId) {
    const escaped = escapeFtsQuery(term);
    if (!escaped)
        return [];
    const db = getDb();
    if (chatId) {
        return db
            .prepare(`SELECT c.id, c.session_id, c.chat_id, c.role, c.content, c.created_at, bm25(conversation_log_fts) AS rank
         FROM conversation_log_fts
         JOIN conversation_log c ON c.id = conversation_log_fts.rowid
         WHERE conversation_log_fts MATCH ? AND c.chat_id = ?
         ORDER BY rank LIMIT ?`)
            .all(escaped, chatId, limit)
            .map(mapRow);
    }
    return db
        .prepare(`SELECT c.id, c.session_id, c.chat_id, c.role, c.content, c.created_at, bm25(conversation_log_fts) AS rank
       FROM conversation_log_fts
       JOIN conversation_log c ON c.id = conversation_log_fts.rowid
       WHERE conversation_log_fts MATCH ?
       ORDER BY rank LIMIT ?`)
        .all(escaped, limit)
        .map(mapRow);
}
function mapRow(raw) {
    const row = raw;
    return {
        id: row.id,
        sessionId: row.session_id,
        chatId: row.chat_id,
        role: row.role,
        content: row.content,
        rank: row.rank,
        createdAt: row.created_at,
    };
}
//# sourceMappingURL=memory-fts.js.map
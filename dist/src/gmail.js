import { google } from 'googleapis';
import { listGmailSince, topGmailByImportance, upsertGmailItem } from './db.js';
import { getAuthedClient, googleAuthConfigured, googleTokenSaved } from './google-auth.js';
import { logger } from './logger.js';
const MAX_FETCH = Number.parseInt(process.env.GMAIL_MAX_FETCH ?? '50', 10);
const LOOKBACK_HOURS = Number.parseInt(process.env.GMAIL_LOOKBACK_HOURS ?? '24', 10);
const DEFAULT_QUERY = process.env.GMAIL_QUERY?.trim() || undefined;
export async function isGmailReady() {
    return googleAuthConfigured() && googleTokenSaved();
}
function headerValue(headers, name) {
    for (const h of headers) {
        if ((h.name ?? '').toLowerCase() === name.toLowerCase())
            return h.value ?? undefined;
    }
    return undefined;
}
export async function pollInbox(lookbackHours = LOOKBACK_HOURS) {
    if (!(await isGmailReady())) {
        return { ok: false, reason: 'not configured', fetched: 0, stored: 0 };
    }
    const auth = await getAuthedClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const afterSec = Math.floor((Date.now() - lookbackHours * 3600_000) / 1000);
    const q = DEFAULT_QUERY
        ? `${DEFAULT_QUERY} after:${afterSec}`
        : `in:inbox after:${afterSec}`;
    let listRes;
    try {
        listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: MAX_FETCH });
    }
    catch (err) {
        logger.error({ err: err instanceof Error ? err.message : err }, 'gmail list failed');
        return { ok: false, reason: 'list failed', fetched: 0, stored: 0 };
    }
    const msgs = listRes.data.messages ?? [];
    let stored = 0;
    for (const m of msgs) {
        if (!m.id)
            continue;
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
            const headers = msg.data.payload?.headers ?? [];
            upsertGmailItem({
                id: m.id,
                threadId: msg.data.threadId ?? undefined,
                sender: headerValue(headers, 'From'),
                subject: headerValue(headers, 'Subject'),
                snippet: msg.data.snippet ?? undefined,
                internalDate: Number.parseInt(msg.data.internalDate ?? '0', 10) || undefined,
                labels: msg.data.labelIds ?? undefined,
                unread: (msg.data.labelIds ?? []).includes('UNREAD'),
            });
            stored += 1;
        }
        catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : err, id: m.id }, 'gmail get failed');
        }
    }
    return { ok: true, fetched: msgs.length, stored };
}
/**
 * Backwards-compat alias. Older callers used pollPriorityInbox when we filtered by
 * a `howl-priority` label — the new pipeline ingests everything and ranks via LLM.
 */
export const pollPriorityInbox = pollInbox;
export function gmailSince(sinceMs, limit = 10) {
    return listGmailSince(sinceMs, limit);
}
export function gmailTopByImportance(sinceMs, limit = 8) {
    return topGmailByImportance(sinceMs, limit);
}
//# sourceMappingURL=gmail.js.map
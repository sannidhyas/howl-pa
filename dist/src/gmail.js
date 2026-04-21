import { google } from 'googleapis';
import { getGmailSyncState, listGmailSince, setGmailSyncState, topGmailByImportance, upsertGmailItem, } from './db.js';
import { getAuthedClient, googleAuthConfigured, googleTokenSaved } from './google-auth.js';
import { logger } from './logger.js';
const MAX_FETCH = 100;
const MAX_TOTAL_FETCH = 1000;
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
function gmailQuery(lastSyncMs) {
    const syncQuery = lastSyncMs === null
        ? 'newer_than:30d'
        : `after:${Math.floor(lastSyncMs / 1000)}`;
    return DEFAULT_QUERY ? `${DEFAULT_QUERY} ${syncQuery}` : syncQuery;
}
export async function pollInbox() {
    if (!(await isGmailReady())) {
        return { ok: false, reason: 'not configured', fetched: 0, stored: 0 };
    }
    const auth = await getAuthedClient();
    const gmail = google.gmail({ version: 'v1', auth });
    const q = gmailQuery(getGmailSyncState());
    let pageToken;
    let fetched = 0;
    let stored = 0;
    while (fetched < MAX_TOTAL_FETCH) {
        const maxResults = Math.min(MAX_FETCH, MAX_TOTAL_FETCH - fetched);
        let listRes;
        try {
            listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults, pageToken });
        }
        catch (err) {
            logger.error({ err: err instanceof Error ? err.message : err }, 'gmail list failed');
            return { ok: false, reason: 'list failed', fetched, stored };
        }
        const msgs = listRes.data.messages ?? [];
        fetched += msgs.length;
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
                    inInbox: (msg.data.labelIds ?? []).includes('INBOX'),
                });
                stored += 1;
            }
            catch (err) {
                logger.warn({ err: err instanceof Error ? err.message : err, id: m.id }, 'gmail get failed');
            }
        }
        pageToken = listRes.data.nextPageToken ?? undefined;
        if (!pageToken)
            break;
    }
    setGmailSyncState(Date.now());
    return { ok: true, fetched, stored };
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
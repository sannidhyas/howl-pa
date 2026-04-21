import { getDb, listGmailLabelChanged, listGmailUnclassified, listMemories, markGmailClassified, } from './db.js';
import { logger } from './logger.js';
import { buildClassifierPrompt } from './prompts/gmail-classifier.js';
import { BACKENDS } from './subagent/router.js';
const BUILT_IN_LABELS = new Set([
    'INBOX',
    'UNREAD',
    'IMPORTANT',
    'SENT',
    'DRAFT',
    'TRASH',
    'SPAM',
    'STARRED',
    'CATEGORY_PERSONAL',
    'CATEGORY_SOCIAL',
    'CATEGORY_PROMOTIONS',
    'CATEGORY_UPDATES',
    'CATEGORY_FORUMS',
]);
let _classifierDown = false;
let _classifierCooldownUntil = 0;
const CLASSIFIER_COOLDOWN_MS = 120_000;
function senderReputation(sender) {
    if (!sender.trim())
        return 'sender 7-day important-rate: 0/0';
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const row = getDb()
        .prepare(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN importance >= 4 THEN 1 ELSE 0 END) AS important
       FROM gmail_items
       WHERE sender = ? AND internal_date >= ?`)
        .get(sender, since);
    return `sender 7-day important-rate: ${Number(row?.important ?? 0)}/${Number(row?.total ?? 0)}`;
}
function recentSenderSubjects(sender, excludeId) {
    if (!sender.trim())
        return [];
    return getDb()
        .prepare(`SELECT subject
       FROM gmail_items
       WHERE sender = ? AND id != ? AND subject IS NOT NULL AND subject != ''
       ORDER BY internal_date DESC LIMIT 3`)
        .all(sender, excludeId)
        .map(r => String(r.subject ?? ''))
        .filter(Boolean);
}
function parseUserLabels(labels) {
    if (!labels)
        return [];
    try {
        const parsed = JSON.parse(labels);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((label) => typeof label === 'string')
            .filter(label => !BUILT_IN_LABELS.has(label.toUpperCase()));
    }
    catch {
        return [];
    }
}
function renderEmailHints() {
    return listMemories('email_hint').map(m => `${m.key}: ${m.value}`).join('\n');
}
function buildBatchPrompt(rows, emailHints) {
    return buildClassifierPrompt({
        emailHints,
        emails: rows.map(r => ({
            id: r.id,
            subject: r.subject ?? '',
            sender: r.sender ?? '',
            snippet: r.snippet ?? '',
            userLabels: parseUserLabels(r.labels),
            senderReputation: senderReputation(r.sender ?? ''),
            recentSubjects: recentSenderSubjects(r.sender ?? '', r.id),
        })),
    });
}
function parseScored(text) {
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const first = trimmed.indexOf('[');
    const last = trimmed.lastIndexOf(']');
    if (first < 0 || last <= first)
        return [];
    try {
        const parsed = JSON.parse(trimmed.slice(first, last + 1));
        if (!Array.isArray(parsed))
            return [];
        const out = [];
        for (const item of parsed) {
            if (!item || typeof item !== 'object')
                continue;
            const row = item;
            if (typeof row.id !== 'string')
                continue;
            const rawImportance = typeof row.importance === 'number'
                ? row.importance
                : Number.parseInt(String(row.importance ?? ''), 10);
            if (!Number.isFinite(rawImportance))
                continue;
            const topic = typeof row.topic === 'string'
                ? row.topic.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 3).join(' ')
                : '';
            out.push({
                id: row.id,
                importance: Math.max(1, Math.min(5, Math.round(rawImportance))),
                importance_reason: typeof row.importance_reason === 'string'
                    ? row.importance_reason
                    : '',
                topic: topic || undefined,
            });
        }
        return out;
    }
    catch {
        return [];
    }
}
function chooseBackendName() {
    const preferred = process.env.GMAIL_CLASSIFIER_BACKEND;
    if (preferred && BACKENDS[preferred])
        return preferred;
    // Default: prefer a local Ollama model if any is registered; else Claude.
    const ollama = Object.keys(BACKENDS).find(n => n.startsWith('ollama:'));
    return ollama ?? 'claude';
}
function nextClassifierRows(limit) {
    const byId = new Map();
    for (const row of listGmailUnclassified(limit))
        byId.set(row.id, row);
    if (byId.size < limit) {
        for (const row of listGmailLabelChanged(limit - byId.size))
            byId.set(row.id, row);
    }
    const candidates = [...byId.values()];
    const rows = candidates.filter(row => {
        if (row.importance === null)
            return true;
        return (row.labels_snapshot ?? null) !== (row.labels ?? null);
    });
    return { rows: rows.slice(0, limit), skipped: candidates.length - rows.length };
}
function markClassifierDown(backend, error) {
    if (!_classifierDown) {
        logger.warn({ backend, error }, 'gmail classifier down - entering cooldown');
    }
    _classifierDown = true;
    _classifierCooldownUntil = Date.now() + CLASSIFIER_COOLDOWN_MS;
}
function recoverClassifierIfReady(backend) {
    if (!_classifierDown)
        return true;
    if (Date.now() < _classifierCooldownUntil)
        return false;
    logger.info({ backend }, 'classifier recovered');
    _classifierDown = false;
    _classifierCooldownUntil = 0;
    return true;
}
export async function classifyPendingEmails(maxBatches = 3, batchSize = 8) {
    const backendName = chooseBackendName();
    const backend = BACKENDS[backendName];
    const out = { classified: 0, skipped: 0, batches: 0, backend: backendName };
    if (!backend)
        return out;
    if (!recoverClassifierIfReady(backendName))
        return out;
    const isOllama = backendName.startsWith('ollama:');
    const emailHints = renderEmailHints();
    for (let i = 0; i < maxBatches; i++) {
        const next = nextClassifierRows(batchSize);
        out.skipped += next.skipped;
        const rows = next.rows;
        if (rows.length === 0)
            break;
        out.batches += 1;
        const prompt = buildBatchPrompt(rows, emailHints);
        let result;
        try {
            result = await backend.run({ prompt, timeoutMs: 120_000 });
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            if (isOllama) {
                markClassifierDown(backendName, error);
                break;
            }
            logger.warn({ backend: backendName, error }, 'classifier backend threw');
            break;
        }
        if (result.error) {
            if (isOllama) {
                markClassifierDown(backendName, result.error);
                break;
            }
            logger.warn({ backend: backendName, error: result.error }, 'classifier backend error');
            break;
        }
        const scored = parseScored(result.text);
        const byId = new Map(scored.map(s => [s.id, s]));
        for (const row of rows) {
            const hit = byId.get(row.id);
            if (!hit) {
                out.skipped += 1;
                continue;
            }
            markGmailClassified(row.id, hit.importance, hit.importance_reason, hit.topic, row.labels ?? undefined);
            out.classified += 1;
        }
        if (scored.length === 0) {
            logger.warn({ backend: backendName, sample: result.text.slice(0, 160) }, 'classifier returned nothing parseable');
            break;
        }
    }
    logger.info(out, 'gmail classify run');
    return out;
}
//# sourceMappingURL=gmail-classifier.js.map
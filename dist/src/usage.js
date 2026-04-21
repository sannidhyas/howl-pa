import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let cache = null;
const CACHE_TTL_MS = 30_000;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readFiniteNumber(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function readRollup(value) {
    if (!isRecord(value))
        return { prompts: 0, sessions: 0, hours: 0 };
    return {
        prompts: readFiniteNumber(value, 'prompts'),
        sessions: readFiniteNumber(value, 'sessions'),
        hours: readFiniteNumber(value, 'hours'),
    };
}
function parseStats(value) {
    if (!isRecord(value))
        return null;
    const user = value.user;
    const updated = value.updated;
    if (typeof user !== 'string' || typeof updated !== 'string')
        return null;
    return {
        user,
        updated,
        today: readRollup(value.today),
        week: readRollup(value.week),
    };
}
function parseWindowHours(value) {
    if (!value)
        return 168;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 168;
    return parsed;
}
function unavailableResponse(windowHours) {
    return {
        ok: true,
        window_hours: windowHours,
        claude: {
            available: false,
            reason: 'claude-shared-usage-tracker not configured — run /usage-install in Claude Code',
        },
        codex: {
            available: false,
            reason: 'claude-shared-usage-tracker not configured',
        },
    };
}
function cachedResponseFor(windowHours) {
    if (!cache || Date.now() - cache.ts >= CACHE_TTL_MS)
        return null;
    if (!isRecord(cache.data) || cache.data.window_hours !== windowHours)
        return null;
    return cache.data;
}
async function readSyncDir() {
    const configPath = path.join(os.homedir(), '.claude', 'usage', 'config.json');
    if (!existsSync(configPath))
        return null;
    try {
        const raw = await readFile(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed))
            return null;
        const syncDir = parsed.sync_dir;
        return typeof syncDir === 'string' && syncDir.trim() ? syncDir : null;
    }
    catch (_e) {
        return null;
    }
}
async function readStatsFile(filePath) {
    try {
        const raw = await readFile(filePath, 'utf8');
        return parseStats(JSON.parse(raw));
    }
    catch (_e) {
        return null;
    }
}
async function buildUsage(windowHours) {
    const syncDir = await readSyncDir();
    if (!syncDir)
        return unavailableResponse(windowHours);
    let names = [];
    try {
        names = (await readdir(syncDir)).filter((name) => name.endsWith('_stats.json')).slice(0, 100);
    }
    catch (_e) {
        names = [];
    }
    const windowStart = new Date(Date.now() - windowHours * 3600 * 1000);
    const useWeek = windowHours >= 168;
    const users = new Set();
    let totalPrompts = 0;
    let totalSessions = 0;
    let totalHours = 0;
    for (const name of names) {
        const stats = await readStatsFile(path.join(syncDir, name));
        if (!stats)
            continue;
        const updatedMs = Date.parse(stats.updated);
        if (!Number.isFinite(updatedMs) || updatedMs < windowStart.getTime())
            continue;
        const rollup = useWeek ? stats.week : stats.today;
        totalPrompts += rollup.prompts;
        totalSessions += rollup.sessions;
        totalHours += rollup.hours;
        users.add(stats.user);
    }
    return {
        ok: true,
        window_hours: windowHours,
        claude: {
            available: true,
            note: 'claude-shared-usage-tracker records prompts/sessions/hours — no per-token breakdown available',
            total_prompts: totalPrompts,
            total_sessions: totalSessions,
            total_hours: totalHours,
            users: Array.from(users).sort(),
            daily: [],
        },
        codex: {
            available: false,
            reason: 'Codex CLI does not write token logs to disk — no local usage data found',
        },
    };
}
export function registerUsageRoute(app, auth) {
    app.get('/api/usage', async (c) => {
        const gate = auth(c);
        if (gate)
            return gate;
        const windowHours = parseWindowHours(c.req.query('window_hours'));
        const cached = cachedResponseFor(windowHours);
        if (cached)
            return c.json(cached);
        let data;
        try {
            data = await buildUsage(windowHours);
        }
        catch (_e) {
            data = unavailableResponse(windowHours);
        }
        cache = { ts: Date.now(), data };
        return c.json(data);
    });
}
//# sourceMappingURL=usage.js.map
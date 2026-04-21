import CronParserModule from 'cron-parser';
// cron-parser 4.x is CJS-only: `module.exports = CronParser`. ESM consumers
// must reach methods through the default export; named imports fail with
// SyntaxError: does not provide an export named 'parseExpression'.
const { parseExpression } = CronParserModule;
import { AGENT_TIMEOUT_MS, ALLOWED_CHAT_ID } from './config.js';
import { dueScheduledTasks, listScheduledTasks, markTaskRan, markTaskRunning, recoverStuckTasks, upsertScheduledTask, } from './db.js';
import { logger } from './logger.js';
import { MISSIONS } from './missions/index.js';
const TICK_MS = 60_000;
let state = {
    timer: null,
    opts: null,
};
export const BUILT_INS = [
    { name: 'morning-brief', mission: 'morning-brief', schedule: '0 7 * * *', description: 'Composes the daily brief from vault + calendar + tasks and sends it to Telegram', priority: 10 },
    { name: 'morning-ritual', mission: 'morning-ritual', schedule: '5 7 * * *', description: 'Asks focus, thesis artifact, venture artifact, and 3 needle tasks for the day', priority: 9 },
    { name: 'evening-nudge', mission: 'evening-nudge', schedule: '0 21 * * *', description: "Checks today's gym, thesis, kit, and meditation flags; sends a nudge for each open item", priority: 8 },
    { name: 'evening-tracker', mission: 'evening-tracker', schedule: '5 21 * * *', description: 'Logs sleep hours, energy, soreness, sport, and reflection via a short survey', priority: 8 },
    { name: 'vault-reindex', mission: 'vault-reindex', schedule: '*/10 * * * *', description: 'Crawls the Obsidian vault and refreshes the memory chunk index in SQLite', priority: 1 },
    { name: 'weekly-review', mission: 'weekly-review', schedule: '0 18 * * 0', description: 'Writes the ISO-week review scaffold note to vault (days, captures, ideas touched)', priority: 5 },
    { name: 'venture-review', mission: 'venture-review', schedule: '30 18 * * 0', description: 'Walks through parked ideas from the week with a keep/open/discard survey', priority: 5 },
    { name: 'gmail-poll', mission: 'gmail-poll', schedule: '*/5 * * * *', description: 'Fetches new priority-inbox messages from Gmail and stores them in the DB', priority: 2 },
    { name: 'gmail-classify', mission: 'gmail-classify', schedule: '*/7 * * * *', description: 'Scores unclassified Gmail items for importance via Ollama/Claude', priority: 3 },
    { name: 'calendar-poll', mission: 'calendar-poll', schedule: '*/15 * * * *', description: 'Syncs upcoming Google Calendar events into the local DB', priority: 2 },
    { name: 'tasks-poll', mission: 'tasks-poll', schedule: '*/5 * * * *', description: 'Pulls Google Tasks from the API and upserts them into the local DB', priority: 2 },
    { name: 'tasks-push', mission: 'tasks-push', schedule: '*/5 * * * *', description: 'Pushes locally-captured tasks back to Google Tasks via the API', priority: 3 },
];
function nextRunFor(schedule, from = new Date()) {
    return parseExpression(schedule, { currentDate: from }).next().getTime();
}
function registerBuiltIns() {
    const existing = new Map(listScheduledTasks().map(t => [t.name, t]));
    for (const b of BUILT_INS) {
        const prev = existing.get(b.name);
        if (prev) {
            // Row already exists: only update the schedule expression if it changed.
            // Never overwrite status — a paused task stays paused across restarts.
            if (prev.schedule !== b.schedule) {
                upsertScheduledTask({
                    name: b.name,
                    mission: b.mission,
                    schedule: b.schedule,
                    priority: b.priority,
                    nextRun: nextRunFor(b.schedule),
                    status: prev.status,
                });
            }
            continue;
        }
        // Brand-new row — first boot or after a /schedule delete.
        upsertScheduledTask({
            name: b.name,
            mission: b.mission,
            schedule: b.schedule,
            priority: b.priority,
            nextRun: nextRunFor(b.schedule),
        });
    }
}
export function initScheduler(opts) {
    state.opts = opts;
    registerBuiltIns();
    const recovered = recoverStuckTasks(AGENT_TIMEOUT_MS);
    if (recovered > 0)
        logger.warn({ recovered }, 'recovered stuck scheduler tasks');
    state.timer = setInterval(() => void tick().catch(err => logger.error({ err }, 'tick failed')), TICK_MS);
    state.timer.unref();
    logger.info({ built_ins: BUILT_INS.map(b => b.name) }, 'scheduler started');
}
export function stopScheduler() {
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
}
export async function runMissionByName(name, args) {
    const fn = MISSIONS[name];
    if (!fn || !state.opts)
        throw new Error(`unknown mission: ${name}`);
    const ctx = {
        send: state.opts.send,
        chatId: state.opts.defaultChatId ?? String(ALLOWED_CHAT_ID),
        now: new Date(),
        args,
    };
    const result = await fn(ctx);
    return result.summary;
}
async function tick() {
    if (!state.opts)
        return;
    const due = dueScheduledTasks();
    for (const task of due) {
        await runScheduled(task);
    }
}
async function runScheduled(task) {
    if (!state.opts)
        return;
    const opts = state.opts;
    const fn = MISSIONS[task.mission];
    if (!fn) {
        logger.warn({ task: task.name, mission: task.mission }, 'unknown mission');
        markTaskRan({
            id: task.id,
            nextRun: nextRunFor(task.schedule),
            lastResult: `skipped: unknown mission ${task.mission}`,
            status: 'disabled',
        });
        return;
    }
    markTaskRunning(task.id);
    const start = Date.now();
    try {
        const result = await fn({
            send: opts.send,
            chatId: opts.defaultChatId ?? String(ALLOWED_CHAT_ID),
            now: new Date(),
            args: task.args ? JSON.parse(task.args) : undefined,
        });
        markTaskRan({
            id: task.id,
            nextRun: nextRunFor(task.schedule),
            lastResult: `ok: ${result.summary} (${Date.now() - start}ms)`,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, task: task.name }, 'mission failed');
        markTaskRan({
            id: task.id,
            nextRun: nextRunFor(task.schedule),
            lastResult: `error: ${msg.slice(0, 400)}`,
        });
    }
}
export function scheduledTaskSummary() {
    return listScheduledTasks().map(t => {
        const nextIso = new Date(t.next_run).toISOString().slice(0, 19).replace('T', ' ');
        return `${t.status === 'active' ? '●' : '○'} ${t.name} · ${t.schedule} · next ${nextIso} · ${t.status}`;
    });
}
//# sourceMappingURL=scheduler.js.map
import { ALLOWED_CHAT_ID } from '../config.js';
import { audit, enqueueMission, scheduledTaskById, updateMissionTaskStatus, } from '../db.js';
import { logger } from '../logger.js';
import { MISSIONS } from './index.js';
let runnerOpts = null;
let warnedMissingOpts = false;
export function initRunner(opts) {
    runnerOpts = opts;
    if (opts)
        warnedMissingOpts = false;
}
function assignedAgentFor(input) {
    return input.agentId ?? (input.source === 'scheduler' ? 'scheduler' : 'manual');
}
function titleFor(input) {
    return input.title ?? `${input.mission}:${input.source}`;
}
function enqueueInput(input) {
    return enqueueMission({
        title: titleFor(input),
        mission: input.mission,
        assignedAgent: assignedAgentFor(input),
        priority: 0,
        source: input.source,
        scheduledTaskId: input.scheduledTaskId,
    });
}
function buildContext(input) {
    if (!runnerOpts && !warnedMissingOpts) {
        warnedMissingOpts = true;
        logger.warn('mission runner has no scheduler options; using no-op send');
    }
    // Mute only suppresses scheduler-originated notifications. Explicit user
    // invocations (telegram/dashboard/adhoc) always deliver — mute is a
    // "don't page me on the cron beat" switch, not a full silencer.
    const rawSend = runnerOpts?.send ?? (async () => { });
    let send = rawSend;
    if (input.source === 'scheduler' && input.scheduledTaskId) {
        const row = scheduledTaskById(input.scheduledTaskId);
        if (row?.muted) {
            send = async () => { };
            logger.info({ mission: input.mission, task: row.name }, 'muted routine — suppressing send');
        }
    }
    return {
        send,
        chatId: input.chatId ?? runnerOpts?.defaultChatId ?? String(ALLOWED_CHAT_ID),
        now: new Date(),
        args: input.args,
    };
}
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
async function doRun(missionTaskId, input, fn, ctx) {
    if (!fn) {
        const msg = `unknown mission: ${input.mission}`;
        updateMissionTaskStatus(missionTaskId, 'failed', msg);
        logger.warn({ mission: input.mission, missionTaskId }, 'unknown mission');
        return { ok: false, missionTaskId, error: msg, durationMs: 0 };
    }
    const start = Date.now();
    try {
        const result = await fn(ctx);
        const durationMs = Date.now() - start;
        updateMissionTaskStatus(missionTaskId, 'done', result.summary);
        audit('mission_done', `${input.mission} ok (${durationMs}ms)`, {
            chatId: ctx.chatId,
            agentId: input.agentId,
            ref_kind: 'mission_task',
            ref_id: missionTaskId,
        });
        return {
            ok: true,
            missionTaskId,
            summary: result.summary,
            durationMs,
        };
    }
    catch (err) {
        const durationMs = Date.now() - start;
        const msg = errorMessage(err);
        updateMissionTaskStatus(missionTaskId, 'failed', msg.slice(0, 400));
        audit('mission_failed', `${input.mission} failed (${durationMs}ms): ${msg.slice(0, 240)}`, {
            chatId: ctx.chatId,
            agentId: input.agentId,
            ref_kind: 'mission_task',
            ref_id: missionTaskId,
        });
        logger.error({ err, mission: input.mission, missionTaskId }, 'mission failed');
        return { ok: false, missionTaskId, error: msg, durationMs };
    }
}
export async function executeMission(input) {
    try {
        const fn = MISSIONS[input.mission];
        const missionTaskId = enqueueInput(input);
        if (!fn) {
            const msg = `unknown mission: ${input.mission}`;
            updateMissionTaskStatus(missionTaskId, 'failed', msg);
            logger.warn({ mission: input.mission, missionTaskId }, 'unknown mission');
            return { ok: false, missionTaskId, error: msg, durationMs: 0 };
        }
        updateMissionTaskStatus(missionTaskId, 'running');
        return await doRun(missionTaskId, input, fn, buildContext(input));
    }
    catch (err) {
        const msg = errorMessage(err);
        logger.error({ err, mission: input.mission }, 'mission execution setup failed');
        return { ok: false, missionTaskId: 0, error: msg, durationMs: 0 };
    }
}
export function startMission(input) {
    const missionTaskId = enqueueInput(input);
    updateMissionTaskStatus(missionTaskId, 'running');
    const done = doRun(missionTaskId, input, MISSIONS[input.mission], buildContext(input));
    return { missionTaskId, done };
}
//# sourceMappingURL=runner.js.map
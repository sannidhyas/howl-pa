import CronParserModule from 'cron-parser';
const { parseExpression } = CronParserModule;
import { MISSIONS } from './missions/index.js';
import { nextRunFor } from './scheduler.js';
import { upsertScheduledTask, updateScheduledFields, listScheduledTasks } from './db.js';
const NAME_RE = /^[a-z0-9_-]{1,64}$/;
function validObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function cronError(schedule) {
    try {
        parseExpression(schedule);
        return null;
    }
    catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}
export async function createRoutine(input) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!NAME_RE.test(name))
        return { ok: false, error: 'invalid name format' };
    if (listScheduledTasks().some(t => t.name === name))
        return { ok: false, error: 'name exists' };
    const mission = typeof input.mission === 'string' ? input.mission.trim() : '';
    if (!Object.hasOwn(MISSIONS, mission)) {
        return { ok: false, error: `unknown mission; valid: ${Object.keys(MISSIONS).join(', ')}` };
    }
    const schedule = typeof input.schedule === 'string' ? input.schedule.trim() : '';
    if (!schedule)
        return { ok: false, error: 'schedule required' };
    const cErr = cronError(schedule);
    if (cErr)
        return { ok: false, error: `invalid cron: ${cErr}` };
    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
        return { ok: false, error: 'priority must be an integer from 0 to 100' };
    }
    if (input.args !== undefined && !validObject(input.args)) {
        return { ok: false, error: 'args must be object' };
    }
    let nextRun;
    try {
        nextRun = nextRunFor(schedule);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `invalid cron: ${msg}` };
    }
    upsertScheduledTask({
        name,
        mission,
        schedule,
        nextRun,
        priority,
        agentId: 'main',
        status: 'active',
        args: JSON.stringify(input.args ?? {}),
    });
    return { ok: true, next_run: nextRun };
}
export async function editRoutine(name, field, rawValue) {
    const routineName = typeof name === 'string' ? name.trim() : '';
    if (!NAME_RE.test(routineName))
        return { ok: false, error: 'invalid name format' };
    const row = listScheduledTasks().find(t => t.name === routineName);
    if (!row)
        return { ok: false, error: 'not found' };
    const key = typeof field === 'string' ? field.trim().toLowerCase() : '';
    if (!['schedule', 'priority', 'args', 'status'].includes(key)) {
        return { ok: false, error: 'field must be schedule, priority, args, or status' };
    }
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value)
        return { ok: false, error: 'value required' };
    if (key === 'schedule') {
        const cErr = cronError(value);
        if (cErr)
            return { ok: false, error: `invalid cron: ${cErr}` };
        let nextRun;
        try {
            nextRun = nextRunFor(value);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, error: `invalid cron: ${msg}` };
        }
        if (!updateScheduledFields(routineName, { schedule: value, nextRun })) {
            return { ok: false, error: 'not found' };
        }
        return { ok: true, updated: 'schedule', next_run: nextRun };
    }
    if (key === 'priority') {
        if (!/^-?\d+$/.test(value))
            return { ok: false, error: 'priority must be an integer from 0 to 100' };
        const priority = Number.parseInt(value, 10);
        if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
            return { ok: false, error: 'priority must be an integer from 0 to 100' };
        }
        if (!updateScheduledFields(routineName, { priority })) {
            return { ok: false, error: 'not found' };
        }
        return { ok: true, updated: 'priority' };
    }
    if (key === 'args') {
        let parsed;
        try {
            parsed = JSON.parse(value);
        }
        catch {
            return { ok: false, error: 'invalid JSON args' };
        }
        if (!validObject(parsed))
            return { ok: false, error: 'args must be object' };
        if (!updateScheduledFields(routineName, { args: JSON.stringify(parsed) })) {
            return { ok: false, error: 'not found' };
        }
        return { ok: true, updated: 'args' };
    }
    const status = value;
    if (status !== 'active' && status !== 'paused') {
        return { ok: false, error: 'status must be active or paused' };
    }
    if (!updateScheduledFields(routineName, { status })) {
        return { ok: false, error: 'not found' };
    }
    return { ok: true, updated: 'status' };
}
//# sourceMappingURL=scheduler-ops.js.map
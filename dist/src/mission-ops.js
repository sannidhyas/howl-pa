import { getDb } from './db.js';
import { updateMissionTaskStatus, enqueueMission, audit } from './db.js';
function missionRow(id) {
    return getDb()
        .prepare(`SELECT id, title, prompt, mission, assigned_agent, priority, source, scheduled_task_id, status
       FROM mission_tasks WHERE id = ?`)
        .get(id);
}
function validId(id) {
    return Number.isSafeInteger(id) && id > 0;
}
export function cancelMission(id) {
    if (!validId(id))
        return { ok: false, error: 'invalid id', status: 400 };
    const task = missionRow(id);
    if (!task)
        return { ok: false, error: 'not found', status: 404 };
    if (task.status === 'running') {
        return { ok: false, error: 'cannot cancel in-flight mission', status: 409 };
    }
    if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
        return { ok: false, error: 'already terminal', status: 409 };
    }
    updateMissionTaskStatus(id, 'cancelled', 'cancelled via telegram');
    audit('mission_cancel', `mission #${id}`, { ref_kind: 'mission_task', ref_id: id });
    return { ok: true };
}
export function retryMission(id) {
    if (!validId(id))
        return { ok: false, error: 'invalid id', status: 400 };
    const original = missionRow(id);
    if (!original)
        return { ok: false, error: 'not found', status: 404 };
    if (original.status === 'running' || original.status === 'queued') {
        return { ok: false, error: 'already in flight', status: 409 };
    }
    if (!original.mission)
        return { ok: false, error: 'not a retryable mission', status: 400 };
    const newId = enqueueMission({
        title: original.title,
        prompt: original.prompt ?? undefined,
        mission: original.mission,
        assignedAgent: original.assigned_agent,
        priority: original.priority,
        source: original.source ?? undefined,
        scheduledTaskId: original.scheduled_task_id ?? undefined,
    });
    audit('mission_retry', `retrying #${id} as #${newId}`, { ref_kind: 'mission_task', ref_id: newId });
    return { ok: true, newId };
}
//# sourceMappingURL=mission-ops.js.map
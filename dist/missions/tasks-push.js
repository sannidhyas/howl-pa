import { isTasksReady, pushPendingTasks } from '../tasks.js';
export const tasksPush = async (_ctx) => {
    if (!isTasksReady())
        return { summary: 'tasks not configured (queued locally)' };
    const result = await pushPendingTasks();
    return { summary: result.ok ? `tasks pushed: ${result.pushed ?? 0}` : `tasks push skip: ${result.reason}` };
};
//# sourceMappingURL=tasks-push.js.map
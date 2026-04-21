import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { getAuthedClient, googleAuthConfigured, googleTokenSaved } from './google-auth.js';
import { deleteTaskItem, listTaskItems, pendingTaskItems, upsertTaskItem, } from './db.js';
import { logger } from './logger.js';
const DEFAULT_LIST = '@default';
export function isTasksReady() {
    return googleAuthConfigured() && googleTokenSaved();
}
export function queueTask(input) {
    const id = `local:${randomUUID()}`;
    upsertTaskItem({
        id,
        listId: input.listId ?? DEFAULT_LIST,
        title: input.title.trim(),
        notes: input.notes,
        dueTs: input.due?.getTime(),
        status: 'needs_push',
        updatedAt: Date.now(),
        importance: input.importance,
        importanceReason: input.importanceReason,
    });
    return listTaskItems(undefined, 1).find(t => t.id === id) ?? {
        id,
        list_id: input.listId ?? DEFAULT_LIST,
        title: input.title.trim(),
        notes: input.notes ?? null,
        due_ts: input.due?.getTime() ?? null,
        status: 'needs_push',
        updated_at: Date.now(),
        synced_at: null,
        importance: input.importance ?? null,
        importance_reason: input.importanceReason ?? null,
    };
}
export async function upsertTask(input) {
    if (!isTasksReady()) {
        return queueTask(input);
    }
    const auth = await getAuthedClient();
    const service = google.tasks({ version: 'v1', auth });
    const listId = input.listId ?? DEFAULT_LIST;
    const res = await service.tasks.insert({
        tasklist: listId,
        requestBody: {
            title: input.title.trim(),
            notes: input.notes,
            due: input.due?.toISOString(),
            status: 'needsAction',
        },
    });
    const task = res.data;
    if (!task.id)
        throw new Error('Google Tasks insert returned no id');
    const row = mapTask(task, listId);
    upsertTaskItem({
        id: row.id,
        listId: row.list_id,
        title: row.title,
        notes: row.notes ?? undefined,
        dueTs: row.due_ts ?? undefined,
        status: row.status,
        updatedAt: row.updated_at ?? Date.now(),
        syncedAt: Date.now(),
        importance: input.importance,
        importanceReason: input.importanceReason,
    });
    return { ...row, importance: input.importance ?? null, importance_reason: input.importanceReason ?? null };
}
export async function pushPendingTasks(limit = 25) {
    if (!isTasksReady())
        return { ok: false, reason: 'not configured', fetched: 0, stored: 0, pushed: 0 };
    const pending = pendingTaskItems(limit);
    if (pending.length === 0)
        return { ok: true, fetched: 0, stored: 0, pushed: 0 };
    let pushed = 0;
    for (const item of pending) {
        if (!item.id.startsWith('local:'))
            continue;
        try {
            await upsertTask({
                title: item.title,
                notes: item.notes ?? undefined,
                due: item.due_ts ? new Date(item.due_ts) : undefined,
                listId: item.list_id,
                importance: item.importance ?? undefined,
                importanceReason: item.importance_reason ?? undefined,
            });
            deleteTaskItem(item.id);
            pushed += 1;
        }
        catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : err, id: item.id }, 'task push failed');
        }
    }
    return { ok: true, fetched: pending.length, stored: pushed, pushed };
}
export async function pollTasks() {
    if (!isTasksReady())
        return { ok: false, reason: 'not configured', fetched: 0, stored: 0 };
    const auth = await getAuthedClient();
    const service = google.tasks({ version: 'v1', auth });
    const lists = await service.tasklists.list({ maxResults: 20 });
    const taskLists = lists.data.items ?? [{ id: DEFAULT_LIST }];
    let fetched = 0;
    let stored = 0;
    for (const list of taskLists) {
        const listId = list.id ?? DEFAULT_LIST;
        const res = await service.tasks.list({
            tasklist: listId,
            showCompleted: true,
            showDeleted: false,
            showHidden: true,
            maxResults: 100,
        });
        const items = res.data.items ?? [];
        fetched += items.length;
        for (const task of items) {
            if (!task.id || !task.title)
                continue;
            const row = mapTask(task, listId);
            upsertTaskItem({
                id: row.id,
                listId: row.list_id,
                title: row.title,
                notes: row.notes ?? undefined,
                dueTs: row.due_ts ?? undefined,
                status: row.status,
                updatedAt: row.updated_at ?? undefined,
                syncedAt: Date.now(),
            });
            stored += 1;
        }
    }
    return { ok: true, fetched, stored };
}
export async function completeTask(id) {
    const existing = listTaskItems(undefined, 200).find(t => t.id === id || shortTaskId(t.id) === id);
    if (!existing)
        return false;
    if (!isTasksReady() || existing.id.startsWith('local:')) {
        upsertTaskItem({ ...toUpsert(existing), status: 'completed', syncedAt: Date.now() });
        return true;
    }
    const auth = await getAuthedClient();
    const service = google.tasks({ version: 'v1', auth });
    const res = await service.tasks.patch({
        tasklist: existing.list_id,
        task: existing.id,
        requestBody: { status: 'completed' },
    });
    const row = mapTask(res.data, existing.list_id);
    upsertTaskItem({ ...toUpsert(row), syncedAt: Date.now() });
    return true;
}
export function taskRows(limit = 20) {
    return listTaskItems(undefined, limit);
}
export function shortTaskId(id) {
    return id.startsWith('local:') ? id.slice(6, 14) : id.slice(0, 8);
}
function mapTask(task, listId) {
    const updated = task.updated ? Date.parse(task.updated) : Date.now();
    const due = task.due ? Date.parse(task.due) : NaN;
    return {
        id: task.id ?? `local:${randomUUID()}`,
        list_id: listId,
        title: task.title ?? '(untitled task)',
        notes: task.notes ?? null,
        due_ts: Number.isFinite(due) ? due : null,
        status: task.status ?? 'needsAction',
        updated_at: Number.isFinite(updated) ? updated : Date.now(),
        synced_at: Date.now(),
        importance: null,
        importance_reason: null,
    };
}
function toUpsert(row) {
    return {
        id: row.id,
        listId: row.list_id,
        title: row.title,
        notes: row.notes ?? undefined,
        dueTs: row.due_ts ?? undefined,
        status: row.status,
        updatedAt: row.updated_at ?? undefined,
        syncedAt: row.synced_at ?? undefined,
        importance: row.importance ?? undefined,
        importanceReason: row.importance_reason ?? undefined,
    };
}
//# sourceMappingURL=tasks.js.map
import type { MissionFn } from './types.js'
import { isTasksReady, pollTasks } from '../tasks.js'

export const tasksPoll: MissionFn = async (_ctx) => {
  if (!isTasksReady()) return { summary: 'tasks not configured (skip)' }
  const result = await pollTasks()
  return { summary: result.ok ? `tasks ok: ${result.stored}/${result.fetched}` : `tasks skip: ${result.reason}` }
}

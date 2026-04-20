import { parseExpression } from 'cron-parser'
import { AGENT_TIMEOUT_MS, ALLOWED_CHAT_ID } from './config.js'
import {
  dueScheduledTasks,
  listScheduledTasks,
  markTaskRan,
  markTaskRunning,
  recoverStuckTasks,
  upsertScheduledTask,
  type ScheduledTaskRow,
} from './db.js'
import { logger } from './logger.js'
import { MISSIONS, type MissionContext } from './missions/index.js'

const TICK_MS = 60_000

export type SchedulerOptions = {
  send: (html: string) => Promise<void>
  defaultChatId?: string
}

let state: { timer: NodeJS.Timeout | null; opts: SchedulerOptions | null } = {
  timer: null,
  opts: null,
}

type BuiltIn = {
  name: string
  mission: string
  schedule: string
  priority: number
}

const BUILT_INS: BuiltIn[] = [
  { name: 'morning-brief', mission: 'morning-brief', schedule: '0 7 * * *', priority: 10 },
  { name: 'morning-ritual', mission: 'morning-ritual', schedule: '5 7 * * *', priority: 9 },
  { name: 'evening-nudge', mission: 'evening-nudge', schedule: '0 21 * * *', priority: 8 },
  { name: 'evening-tracker', mission: 'evening-tracker', schedule: '5 21 * * *', priority: 8 },
  { name: 'vault-reindex', mission: 'vault-reindex', schedule: '*/10 * * * *', priority: 1 },
  { name: 'weekly-review', mission: 'weekly-review', schedule: '0 18 * * 0', priority: 5 },
  { name: 'venture-review', mission: 'venture-review', schedule: '30 18 * * 0', priority: 5 },
  { name: 'gmail-poll', mission: 'gmail-poll', schedule: '*/5 * * * *', priority: 2 },
  { name: 'gmail-classify', mission: 'gmail-classify', schedule: '*/7 * * * *', priority: 3 },
  { name: 'calendar-poll', mission: 'calendar-poll', schedule: '*/15 * * * *', priority: 2 },
]

function nextRunFor(schedule: string, from = new Date()): number {
  return parseExpression(schedule, { currentDate: from }).next().getTime()
}

function registerBuiltIns(): void {
  const existing = new Map(listScheduledTasks().map(t => [t.name, t]))
  for (const b of BUILT_INS) {
    const prev = existing.get(b.name)
    if (prev && prev.schedule === b.schedule) continue
    upsertScheduledTask({
      name: b.name,
      mission: b.mission,
      schedule: b.schedule,
      priority: b.priority,
      nextRun: nextRunFor(b.schedule),
    })
  }
}

export function initScheduler(opts: SchedulerOptions): void {
  state.opts = opts
  registerBuiltIns()
  const recovered = recoverStuckTasks(AGENT_TIMEOUT_MS)
  if (recovered > 0) logger.warn({ recovered }, 'recovered stuck scheduler tasks')

  state.timer = setInterval(() => void tick().catch(err => logger.error({ err }, 'tick failed')), TICK_MS)
  state.timer.unref()
  logger.info({ built_ins: BUILT_INS.map(b => b.name) }, 'scheduler started')
}

export function stopScheduler(): void {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
}

export async function runMissionByName(name: string, args?: Record<string, unknown>): Promise<string> {
  const fn = MISSIONS[name]
  if (!fn || !state.opts) throw new Error(`unknown mission: ${name}`)
  const ctx: MissionContext = {
    send: state.opts.send,
    chatId: state.opts.defaultChatId ?? String(ALLOWED_CHAT_ID),
    now: new Date(),
    args,
  }
  const result = await fn(ctx)
  return result.summary
}

async function tick(): Promise<void> {
  if (!state.opts) return
  const due = dueScheduledTasks()
  for (const task of due) {
    await runScheduled(task)
  }
}

async function runScheduled(task: ScheduledTaskRow): Promise<void> {
  if (!state.opts) return
  const opts = state.opts
  const fn = MISSIONS[task.mission]
  if (!fn) {
    logger.warn({ task: task.name, mission: task.mission }, 'unknown mission')
    markTaskRan({
      id: task.id,
      nextRun: nextRunFor(task.schedule),
      lastResult: `skipped: unknown mission ${task.mission}`,
      status: 'disabled',
    })
    return
  }
  markTaskRunning(task.id)
  const start = Date.now()
  try {
    const result = await fn({
      send: opts.send,
      chatId: opts.defaultChatId ?? String(ALLOWED_CHAT_ID),
      now: new Date(),
      args: task.args ? (JSON.parse(task.args) as Record<string, unknown>) : undefined,
    })
    markTaskRan({
      id: task.id,
      nextRun: nextRunFor(task.schedule),
      lastResult: `ok: ${result.summary} (${Date.now() - start}ms)`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err, task: task.name }, 'mission failed')
    markTaskRan({
      id: task.id,
      nextRun: nextRunFor(task.schedule),
      lastResult: `error: ${msg.slice(0, 400)}`,
    })
  }
}

export function scheduledTaskSummary(): string[] {
  return listScheduledTasks().map(t => {
    const nextIso = new Date(t.next_run).toISOString().slice(0, 19).replace('T', ' ')
    return `${t.status === 'active' ? '●' : '○'} ${t.name} · ${t.schedule} · next ${nextIso} · ${t.status}`
  })
}

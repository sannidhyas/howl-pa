import type { MissionFn } from './types.js'
import { isCalendarReady, pollCalendar } from '../calendar.js'

export const calendarPoll: MissionFn = async (_ctx) => {
  if (!(await isCalendarReady())) {
    return { summary: 'calendar not configured (skip)' }
  }
  const result = await pollCalendar()
  return {
    summary: result.ok ? `cal ok: ${result.stored}/${result.fetched}` : `cal ${result.reason}`,
    data: result as unknown as Record<string, unknown>,
  }
}

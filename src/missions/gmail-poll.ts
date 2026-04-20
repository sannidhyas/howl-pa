import type { MissionFn } from './types.js'
import { isGmailReady, pollPriorityInbox } from '../gmail.js'

export const gmailPoll: MissionFn = async (_ctx) => {
  if (!(await isGmailReady())) {
    return { summary: 'gmail not configured (skip)' }
  }
  const result = await pollPriorityInbox()
  return {
    summary: result.ok ? `gmail ok: ${result.stored}/${result.fetched}` : `gmail ${result.reason}`,
    data: result as unknown as Record<string, unknown>,
  }
}

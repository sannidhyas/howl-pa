import type { MissionFn } from './types.js'
import { openEveningSurvey } from '../rituals.js'

export const eveningTracker: MissionFn = async (ctx) => {
  await openEveningSurvey(ctx.chatId, ctx.send)
  return { summary: 'evening survey prompt sent' }
}

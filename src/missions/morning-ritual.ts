import type { MissionFn } from './types.js'
import { openMorningSurvey } from '../rituals.js'

export const morningRitual: MissionFn = async (ctx) => {
  await openMorningSurvey(ctx.chatId, ctx.send)
  return { summary: 'morning ritual prompt sent' }
}

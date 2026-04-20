import type { MissionFn } from './types.js'
import { openWeeklyReviewSurvey } from '../rituals.js'

export const ventureReview: MissionFn = async (ctx) => {
  await openWeeklyReviewSurvey(ctx.chatId, ctx.send)
  return { summary: 'venture weekly review prompt sent' }
}

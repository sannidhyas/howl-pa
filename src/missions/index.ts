import type { MissionFn } from './types.js'
import { vaultReindex } from './vault-reindex.js'
import { eveningNudgeMission } from './evening-nudge-mission.js'
import { morningBrief } from './morning-brief.js'
import { weeklyReview } from './weekly-review.js'
import { gmailPoll } from './gmail-poll.js'
import { gmailClassify } from './gmail-classify.js'
import { calendarPoll } from './calendar-poll.js'

export const MISSIONS: Record<string, MissionFn> = {
  'vault-reindex': vaultReindex,
  'evening-nudge': eveningNudgeMission,
  'morning-brief': morningBrief,
  'weekly-review': weeklyReview,
  'gmail-poll': gmailPoll,
  'gmail-classify': gmailClassify,
  'calendar-poll': calendarPoll,
}

export type { MissionFn, MissionContext, MissionResult } from './types.js'

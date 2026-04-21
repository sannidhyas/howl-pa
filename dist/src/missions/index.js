import { vaultReindex } from './vault-reindex.js';
import { eveningNudgeMission } from './evening-nudge-mission.js';
import { morningBrief } from './morning-brief.js';
import { weeklyReview } from './weekly-review.js';
import { gmailPoll } from './gmail-poll.js';
import { gmailClassify } from './gmail-classify.js';
import { calendarPoll } from './calendar-poll.js';
import { morningRitual } from './morning-ritual.js';
import { eveningTracker } from './evening-tracker.js';
import { ventureReview } from './venture-review.js';
import { tasksPoll } from './tasks-poll.js';
import { tasksPush } from './tasks-push.js';
export const MISSIONS = {
    'vault-reindex': vaultReindex,
    'evening-nudge': eveningNudgeMission,
    'morning-brief': morningBrief,
    'weekly-review': weeklyReview,
    'gmail-poll': gmailPoll,
    'gmail-classify': gmailClassify,
    'calendar-poll': calendarPoll,
    'tasks-poll': tasksPoll,
    'tasks-push': tasksPush,
    'morning-ritual': morningRitual,
    'evening-tracker': eveningTracker,
    'venture-review': ventureReview,
};
//# sourceMappingURL=index.js.map
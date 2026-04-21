import { isGmailReady, pollPriorityInbox } from '../gmail.js';
export const gmailPoll = async (_ctx) => {
    if (!(await isGmailReady())) {
        return { summary: 'gmail not configured (skip)' };
    }
    const result = await pollPriorityInbox();
    return {
        summary: result.ok ? `gmail ok: ${result.stored}/${result.fetched}` : `gmail ${result.reason}`,
        data: result,
    };
};
//# sourceMappingURL=gmail-poll.js.map
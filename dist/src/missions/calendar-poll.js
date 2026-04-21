import { isCalendarReady, pollCalendar } from '../calendar.js';
export const calendarPoll = async (_ctx) => {
    if (!(await isCalendarReady())) {
        return { summary: 'calendar not configured (skip)' };
    }
    const result = await pollCalendar();
    return {
        summary: result.ok ? `cal ok: ${result.stored}/${result.fetched}` : `cal ${result.reason}`,
        data: result,
    };
};
//# sourceMappingURL=calendar-poll.js.map
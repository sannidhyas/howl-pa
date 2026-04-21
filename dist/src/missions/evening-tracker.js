import { openEveningSurvey } from '../rituals.js';
export const eveningTracker = async (ctx) => {
    await openEveningSurvey(ctx.chatId, ctx.send);
    return { summary: 'evening survey prompt sent' };
};
//# sourceMappingURL=evening-tracker.js.map
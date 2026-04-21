import { openWeeklyReviewSurvey } from '../rituals.js';
export const ventureReview = async (ctx) => {
    await openWeeklyReviewSurvey(ctx.chatId, ctx.send);
    return { summary: 'venture weekly review prompt sent' };
};
//# sourceMappingURL=venture-review.js.map
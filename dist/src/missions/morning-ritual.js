import { openMorningSurvey } from '../rituals.js';
export const morningRitual = async (ctx) => {
    await openMorningSurvey(ctx.chatId, ctx.send);
    return { summary: 'morning ritual prompt sent' };
};
//# sourceMappingURL=morning-ritual.js.map
import { computeNudges, formatNudgeHtml, todayFlags } from '../evening-nudge.js';
export const eveningNudgeMission = async (ctx) => {
    const flags = await todayFlags();
    if (!flags) {
        await ctx.send('<b>Evening check</b> · daily note not found.');
        return { summary: 'no daily note' };
    }
    const nudges = computeNudges(flags);
    await ctx.send(formatNudgeHtml(nudges));
    return { summary: `nudges=${nudges.length}`, data: { count: nudges.length } };
};
//# sourceMappingURL=evening-nudge-mission.js.map
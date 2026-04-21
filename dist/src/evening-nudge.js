import { readDailyNote, parseFrontmatter, ensureDailyNote, todayIso } from './vault.js';
function toBool(v) {
    return v === 'true';
}
export async function todayFlags(isoDate = todayIso()) {
    let raw = await readDailyNote(isoDate);
    if (!raw) {
        await ensureDailyNote(isoDate);
        raw = await readDailyNote(isoDate);
    }
    if (!raw)
        return null;
    const { frontmatter } = parseFrontmatter(raw);
    return {
        gym_required: toBool(frontmatter.gym_required),
        thesis_required: toBool(frontmatter.thesis_required),
        gym_done: toBool(frontmatter.gym_done),
        thesis_done: toBool(frontmatter.thesis_done),
        kit_done: toBool(frontmatter.kit_done),
        meditation_done: toBool(frontmatter.meditation_done),
        exempt: toBool(frontmatter.exempt),
        day_type: frontmatter.day_type,
    };
}
export function computeNudges(flags) {
    if (flags.exempt)
        return [];
    const out = [];
    if (flags.gym_required && !flags.gym_done)
        out.push({ flag: 'gym', message: 'Gym not marked done.' });
    if (flags.thesis_required && !flags.thesis_done)
        out.push({ flag: 'thesis', message: 'Thesis artifact not logged today.' });
    if (!flags.kit_done)
        out.push({ flag: 'kit', message: 'Kit (daily practice) not marked done.' });
    if (!flags.meditation_done)
        out.push({ flag: 'meditation', message: 'Meditation not marked done.' });
    return out;
}
export function formatNudgeHtml(items) {
    if (items.length === 0)
        return `<b>Evening check</b> · all green for today 🟢`;
    const lines = items.map(i => `• <b>${i.flag}</b> — ${i.message}`).join('\n');
    return `<b>Evening check</b> · ${items.length} open\n${lines}\n\nPenalty clearing: see <code>01_System/Consequences.md</code>.`;
}
//# sourceMappingURL=evening-nudge.js.map
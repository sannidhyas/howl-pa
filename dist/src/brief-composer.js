import { escapeHtml } from './format-telegram.js';
import { readDailyNote, parseFrontmatter, ensureDailyNote, todayIso, vaultRelFrom, } from './vault.js';
import { listVaultNotes } from './memory-graph.js';
import { calendarBetween } from './calendar.js';
import { gmailSince, gmailTopByImportance } from './gmail.js';
import { googleAuthConfigured, googleTokenSaved, } from './google-auth.js';
import { taskRows, shortTaskId } from './tasks.js';
function fmtTime(ms) {
    if (!ms)
        return '—';
    return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
export async function composeMorningBrief() {
    const date = todayIso();
    await ensureDailyNote(date);
    const raw = (await readDailyNote(date)) ?? '';
    const { frontmatter } = parseFrontmatter(raw);
    const required = [];
    if (frontmatter.gym_required === 'true')
        required.push('gym');
    if (frontmatter.thesis_required === 'true')
        required.push('thesis');
    required.push('kit', 'meditation');
    const now = Date.now();
    const lastDay = now - 24 * 3600_000;
    const nextDay = now + 24 * 3600_000;
    // Calendar
    let calendarLines;
    if (googleAuthConfigured() && googleTokenSaved()) {
        const events = calendarBetween(now - 3600_000, nextDay);
        calendarLines = events.length === 0
            ? ['<i>no events in next 24h</i>']
            : events.slice(0, 10).map(e => {
                const time = fmtTime(e.starts_at);
                const sum = escapeHtml(e.summary ?? '(no title)');
                const link = e.meet_link ? ` · <a href="${escapeHtml(e.meet_link)}">meet</a>` : '';
                return `• <b>${time}</b> ${sum}${link}`;
            });
    }
    else {
        calendarLines = ['<i>not configured — run `npx tsx scripts/setup-google.ts`</i>'];
    }
    // Gmail — ranked by LLM-scored importance, not user labels.
    let gmailLines;
    if (googleAuthConfigured() && googleTokenSaved()) {
        const ranked = gmailTopByImportance(lastDay, 8);
        const items = ranked.length > 0 ? ranked : gmailSince(lastDay, 8);
        gmailLines = items.length === 0
            ? ['<i>no inbox activity in last 24h</i>']
            : items.map(m => {
                const sender = escapeHtml((m.sender ?? '').split('<')[0]?.trim() || 'unknown');
                const subj = escapeHtml(m.subject ?? '(no subject)');
                const score = m.importance !== null && m.importance !== undefined ? ` · <i>${m.importance}</i>` : '';
                const why = m.importance_reason ? ` <span class="muted">${escapeHtml(m.importance_reason)}</span>` : '';
                return `• <b>${sender}</b> — ${subj}${score}${why}`;
            });
    }
    else {
        gmailLines = ['<i>not configured — run `npm run setup:google`</i>'];
    }
    const tasks = taskRows(8).filter(t => t.status !== 'completed');
    const taskLines = tasks.length === 0
        ? ['<i>no open tasks tracked</i>']
        : tasks.map(t => {
            const due = t.due_ts ? ` · ${escapeHtml(new Date(t.due_ts).toLocaleDateString('en-IN'))}` : '';
            return `• <code>${escapeHtml(shortTaskId(t.id))}</code> ${escapeHtml(t.title)}${due}`;
        });
    // Vault
    const inboxFiles = listVaultNotes('04_Notes/inbox');
    const recentInbox = inboxFiles
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 5)
        .map(n => vaultRelFrom(n.absPath));
    let openIdeas = [];
    try {
        openIdeas = listVaultNotes('06_Projects/ideas')
            .filter(n => n.relPath.endsWith('/index.md'))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 3)
            .map(n => vaultRelFrom(n.absPath));
    }
    catch {
        /* ignore */
    }
    const htmlLines = [
        `<b>Morning brief</b> · <code>${date}</code> · <i>${escapeHtml(frontmatter.weekday ?? '?')}</i>`,
        '',
        `<b>Required today</b>: ${required.map(escapeHtml).join(', ')}`,
        '',
        '<b>Calendar · next 24h</b>',
        ...calendarLines,
        '',
        '<b>Inbox · priority · 24h</b>',
        ...gmailLines,
        '',
        '<b>Google Tasks · open</b>',
        ...taskLines,
        '',
        `<b>Vault inbox (recent)</b> · ${recentInbox.length}`,
        ...recentInbox.map(p => `• <code>${escapeHtml(p)}</code>`),
    ];
    if (openIdeas.length > 0) {
        htmlLines.push('', `<b>Open ideas</b> · ${openIdeas.length}`);
        htmlLines.push(...openIdeas.map(p => `• <code>${escapeHtml(p)}</code>`));
    }
    htmlLines.push('', `<b>Daily note</b> → <code>${escapeHtml(`03_Daily/${date}.md`)}</code>`);
    const html = htmlLines.join('\n');
    const markdownLines = [
        `## Brief — ${date}`,
        '',
        `- Required: ${required.join(', ')}`,
        `- Calendar: ${calendarLines.length === 1 && calendarLines[0]?.includes('not configured') ? 'n/a' : `${calendarLines.length} items`}`,
        `- Gmail priority: ${gmailLines.length === 1 && gmailLines[0]?.includes('not configured') ? 'n/a' : `${gmailLines.length} items`}`,
        `- Google Tasks: ${tasks.length} open`,
        `- Vault inbox (${recentInbox.length}):`,
        ...recentInbox.map(p => `  - [[${p}]]`),
    ];
    if (openIdeas.length > 0) {
        markdownLines.push(`- Open ideas (${openIdeas.length}):`);
        markdownLines.push(...openIdeas.map(p => `  - [[${p}]]`));
    }
    const markdown = markdownLines.join('\n');
    return { html, markdown };
}
//# sourceMappingURL=brief-composer.js.map
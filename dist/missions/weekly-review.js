import { writeFile, mkdir } from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import { VAULT_PATH } from '../config.js';
import { VAULT_SUBDIRS, todayIso, vaultPath, vaultRelFrom, isoWeekId } from '../vault.js';
import { listVaultNotes } from '../memory-graph.js';
import { logger } from '../logger.js';
const git = simpleGit(VAULT_PATH);
export const weeklyReview = async (ctx) => {
    const now = ctx.now;
    const date = now.toISOString().slice(0, 10);
    const weekId = isoWeekId(date);
    const fileAbs = vaultPath(VAULT_SUBDIRS.progress, `${weekId}.md`);
    const rel = vaultRelFrom(fileAbs);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 86_400_000);
        days.push(d.toISOString().slice(0, 10));
    }
    const dailyPaths = days.map(iso => vaultPath(VAULT_SUBDIRS.daily, `${iso}.md`));
    const linkBlock = dailyPaths
        .map(abs => `- [[${vaultRelFrom(abs)}]]`)
        .join('\n');
    const ideas = listVaultNotes('06_Projects/ideas')
        .filter(n => n.relPath.endsWith('/index.md'))
        .filter(n => now.getTime() - n.mtime < 7 * 86_400_000);
    const captures = listVaultNotes('04_Notes/inbox')
        .filter(n => now.getTime() - n.mtime < 7 * 86_400_000);
    const body = `---
created: ${todayIso()}
week: ${weekId}
tags: [weekly-review, auto]
---

# Weekly review — ${weekId}

## Days
${linkBlock}

## Captures this week
${captures.map(n => `- [[${vaultRelFrom(n.absPath)}]]`).join('\n') || '- _none_'}

## Ideas touched
${ideas.map(n => `- [[${vaultRelFrom(n.absPath)}]]`).join('\n') || '- _none_'}

## Reflections

- What advanced?
- What slipped?
- What changes next week?
`;
    await mkdir(vaultPath(VAULT_SUBDIRS.progress), { recursive: true });
    await writeFile(fileAbs, body);
    try {
        await git.add(rel);
        await git.commit(`[mc] weekly-review: ${rel}`);
        try {
            await git.push();
        }
        catch (err) {
            logger.warn({ err }, 'weekly push failed');
        }
    }
    catch (err) {
        logger.warn({ err }, 'weekly commit failed');
    }
    await ctx.send(`<b>Weekly review</b> · <code>${rel}</code> written. Fill in reflections.`);
    return { summary: 'weekly review written', data: { weekId } };
};
//# sourceMappingURL=weekly-review.js.map
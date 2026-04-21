import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { VAULT_PATH } from './config.js';
export const VAULT_SUBDIRS = {
    dashboard: '00_Dashboard',
    system: '01_System',
    plans: '02_Plans',
    templates: '02_Templates',
    daily: '03_Daily',
    notes: '04_Notes',
    literature: '04_Notes/41_Literature',
    progress: '05_Progress',
    projects: '06_Projects',
    pipeline: '08_Pipeline',
    attachments: 'Attachments',
};
export function vaultPath(...parts) {
    return join(VAULT_PATH, ...parts);
}
export function vaultRelFrom(abs) {
    return relative(VAULT_PATH, abs).split(sep).join('/');
}
export function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
export function nowStamp() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekdayShort(isoDate) {
    const d = new Date(`${isoDate}T12:00:00`);
    return SHORT_DAY[d.getDay()];
}
export function isoWeekId(isoDate) {
    const d = new Date(`${isoDate}T12:00:00`);
    const target = new Date(d.valueOf());
    const dayNum = (d.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
    const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export function buildDailyFrontmatter(isoDate) {
    const wd = weekdayShort(isoDate);
    const gymDays = new Set(['Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const thesisDays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    return {
        date: isoDate,
        weekday: wd,
        week_id: isoWeekId(isoDate),
        day_type: 'normal',
        exempt: false,
        fasting: wd === 'Mon' ? 'water_fast_until_14' : 'IF_08_14',
        gym_required: gymDays.has(wd),
        thesis_required: thesisDays.has(wd),
        gym_done: false,
        thesis_done: false,
        kit_done: false,
        meditation_done: false,
        artifact_type: '',
        sport: '',
        swim: false,
        sleep_hours: '',
        energy: '',
        soreness: '',
        penalty_emom: false,
        penalty_donation: false,
        penalty_reset: false,
        donation_amount: 0,
    };
}
export function serializeFrontmatter(data) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(data)) {
        lines.push(`${k}: ${serializeValue(v)}`);
    }
    lines.push('---');
    return lines.join('\n');
}
function serializeValue(v) {
    if (v === null || v === undefined || v === '')
        return '';
    if (typeof v === 'boolean')
        return v ? 'true' : 'false';
    if (typeof v === 'number')
        return String(v);
    if (Array.isArray(v))
        return `[${v.map(serializeValue).join(', ')}]`;
    if (typeof v === 'string') {
        if (/[:#&*!|>'"%@`]/.test(v) || v.startsWith('-') || v.includes('\n')) {
            return `"${v.replace(/"/g, '\\"')}"`;
        }
        return v;
    }
    return String(v);
}
export function parseFrontmatter(text) {
    const m = /^---\n([\s\S]*?)\n---\n?/m.exec(text);
    if (!m || !m[1])
        return { frontmatter: {}, body: text };
    const fm = {};
    for (const raw of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw);
        if (kv && kv[1])
            fm[kv[1]] = (kv[2] ?? '').trim();
    }
    return { frontmatter: fm, body: text.slice(m[0].length) };
}
const DAILY_SECTIONS = `

## Focus (pick 1–3)

-
-
-

## Thesis artifact (one tangible thing)

-

## Venture artifact (one tangible thing)

-

## Notes (quick capture)

-

## Brief

_Awaiting morning brief._

## Links (optional)

-

## End-of-day (30 seconds)

- Toggle completion in Properties
- If a required item was missed and exempt is false: clear it in Properties (see 01_System/Consequences.md)
`;
export async function ensureDailyNote(isoDate = todayIso()) {
    const path = vaultPath(VAULT_SUBDIRS.daily, `${isoDate}.md`);
    if (existsSync(path))
        return { path, created: false };
    mkdirSync(dirname(path), { recursive: true });
    const fm = buildDailyFrontmatter(isoDate);
    const body = serializeFrontmatter(fm) + DAILY_SECTIONS;
    await writeFile(path, body);
    return { path, created: true };
}
export async function readDailyNote(isoDate = todayIso()) {
    const path = vaultPath(VAULT_SUBDIRS.daily, `${isoDate}.md`);
    if (!existsSync(path))
        return null;
    return await readFile(path, 'utf8');
}
export async function writeDailyNote(isoDate, content) {
    const path = vaultPath(VAULT_SUBDIRS.daily, `${isoDate}.md`);
    mkdirSync(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
}
export async function appendToDailySection(isoDate, sectionHeading, line) {
    const current = (await readDailyNote(isoDate)) ?? '';
    if (!current) {
        await ensureDailyNote(isoDate);
        return appendToDailySection(isoDate, sectionHeading, line);
    }
    const heading = `## ${sectionHeading}`;
    const idx = current.indexOf(heading);
    if (idx < 0) {
        const appended = `${current.trimEnd()}\n\n${heading}\n\n${line}\n`;
        return await writeDailyNote(isoDate, appended);
    }
    const nextIdx = current.indexOf('\n## ', idx + heading.length);
    const end = nextIdx < 0 ? current.length : nextIdx;
    const section = current.slice(idx, end);
    const updatedSection = section.trimEnd() + `\n${line}\n\n`;
    const updated = current.slice(0, idx) + updatedSection + current.slice(end);
    return await writeDailyNote(isoDate, updated);
}
//# sourceMappingURL=vault.js.map
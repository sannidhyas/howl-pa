import { Bot, GrammyError } from 'grammy';
import { ALLOWED_CHAT_ID, SHOW_COST_FOOTER, TELEGRAM_BOT_TOKEN } from './config.js';
import { logger } from './logger.js';
import { executeEmergencyKill, checkIdleLock, isLocked, isSecurityEnabled, lock, matchesKillPhrase, touchActivity, unlock, } from './security.js';
import { redactSecrets, scanForSecrets } from './exfiltration-guard.js';
import { runAgentWithRetry } from './agent.js';
import { audit, deleteScheduledTask, latestSessionFor, listMissionTasks, listScheduledTasks, setTaskStatus, } from './db.js';
import { BUILT_INS, scheduledTaskSummary } from './scheduler.js';
import { executeMission } from './missions/runner.js';
import { cronHuman } from './cron-human.js';
import { recall } from './memory.js';
import { BACKENDS, availableBackends, dispatchSubagent, } from './subagent/router.js';
import { parseDelegation, routeDelegation } from './orchestrator.js';
import { discardIdea, listParkedIdeas, openIdea } from './idea-open.js';
import { isSurveyActive } from './conversation-state.js';
import { handleSurveyReply } from './rituals.js';
import { reindexVault } from './vault-indexer.js';
import { mirrorThesis } from './thesis-mirror.js';
import { routeCapture } from './capture-router.js';
import { computeNudges, formatNudgeHtml, todayFlags } from './evening-nudge.js';
import { chatEvents } from './state.js';
import { completeTask, pushPendingTasks, shortTaskId, taskRows } from './tasks.js';
import { escapeHtml, formatMirrorResultHtml, formatRecallHtml, formatReindexResultHtml, } from './format-telegram.js';
const MAX_TELEGRAM_TEXT = 4096;
const ROUTINE_GROUPS = [
    { title: 'Daily', names: ['morning-brief', 'morning-ritual', 'evening-nudge', 'evening-tracker'] },
    { title: 'Polling', names: ['gmail-poll', 'gmail-classify', 'calendar-poll', 'tasks-poll', 'tasks-push'] },
    { title: 'Weekly', names: ['weekly-review', 'venture-review'] },
    { title: 'Vault', names: ['vault-reindex'] },
];
function formatRoutineLine(task, status) {
    const paused = status === 'paused' ? ' (paused)' : '';
    return `• <code>${escapeHtml(task.name)}</code> — ${escapeHtml(cronHuman(task.schedule))} — ${escapeHtml(task.description)}${paused}`;
}
function routinesHtml() {
    const statusByName = new Map(listScheduledTasks().map(t => [t.name, t.status]));
    const builtInByName = new Map(BUILT_INS.map(b => [b.name, b]));
    const sections = ROUTINE_GROUPS.map(group => {
        const lines = group.names
            .map(name => builtInByName.get(name))
            .filter((task) => Boolean(task))
            .map(task => formatRoutineLine(task, statusByName.get(task.name)))
            .join('\n');
        return `<b>${group.title}</b>\n${lines}`;
    });
    return `<b>Built-in routines</b>\n\n${sections.join('\n\n')}\n\nPause/resume: <code>/schedule pause &lt;name&gt;</code>, <code>/schedule resume &lt;name&gt;</code>\nRun now: <code>/mission run &lt;name&gt;</code>`;
}
const queues = new Map();
const processing = new Set();
function enqueue(chatId, job) {
    if (!queues.has(chatId))
        queues.set(chatId, []);
    queues.get(chatId).push(job);
    void drain(chatId);
}
async function drain(chatId) {
    if (processing.has(chatId))
        return;
    processing.add(chatId);
    try {
        const queue = queues.get(chatId);
        if (!queue)
            return;
        while (queue.length > 0) {
            const job = queue.shift();
            if (!job)
                continue;
            try {
                await job();
            }
            catch (err) {
                logger.error({ err, chatId }, 'queued job failed');
            }
        }
    }
    finally {
        processing.delete(chatId);
    }
}
export function splitMessage(text, limit = MAX_TELEGRAM_TEXT) {
    if (text.length <= limit)
        return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
        // Prefer the last paragraph break, then newline, then space, then hard cut.
        const para = rest.lastIndexOf('\n\n', limit);
        const line = rest.lastIndexOf('\n', limit);
        const space = rest.lastIndexOf(' ', limit);
        const cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\s+/, '');
    }
    if (rest.length > 0)
        chunks.push(rest);
    return chunks;
}
export function isAuthorised(chatId) {
    return String(chatId) === String(ALLOWED_CHAT_ID);
}
function costFooter(result) {
    switch (SHOW_COST_FOOTER) {
        case 'off':
            return '';
        case 'cost':
            return result.costUsd !== undefined
                ? `\n\n— $${result.costUsd.toFixed(4)} (${result.durationMs}ms)`
                : '';
        case 'full':
            return `\n\n— ${result.model ?? 'claude'} · ${result.inputTokens}/${result.outputTokens} tok · ${result.durationMs}ms · tools:${result.toolCallsUsed}${result.costUsd ? ` · $${result.costUsd.toFixed(4)}` : ''}`;
        case 'verbose':
            return `\n\n— ${result.inputTokens + result.outputTokens} tok · ${(result.durationMs / 1000).toFixed(1)}s`;
        case 'compact':
        default:
            return `\n\n— ${Math.round((result.inputTokens + result.outputTokens) / 1000)}k · ${(result.durationMs / 1000).toFixed(1)}s`;
    }
}
async function handleCommand(ctx, text) {
    const chatId = String(ctx.chat.id);
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    switch (cmd) {
        case '/start':
            await ctx.reply(`Howl PA is online.\n\n` +
                (isSecurityEnabled() && isLocked()
                    ? `Locked. DM your PIN to unlock.`
                    : `Ready. Send a message to begin.`));
            return true;
        case '/chatid':
            await ctx.reply(`chat_id: \`${chatId}\``, { parse_mode: 'MarkdownV2' }).catch(() => ctx.reply(`chat_id: ${chatId}`));
            return true;
        case '/status': {
            const sessionId = latestSessionFor(chatId) ?? '(none)';
            await ctx.reply(`status:\n` +
                `• locked: ${isLocked()}\n` +
                `• security enabled: ${isSecurityEnabled()}\n` +
                `• latest session: ${sessionId}`);
            return true;
        }
        case '/newchat':
            // Next user message starts fresh — signaled by absence of resume target.
            await ctx.reply('new session on next message.');
            return true;
        case '/lock':
            lock('user_requested', chatId);
            await ctx.reply('locked.');
            return true;
        case '/recall': {
            const query = parts.slice(1).join(' ').trim();
            if (!query) {
                await ctx.reply('usage: /recall <query>');
                return true;
            }
            const hits = await recall(query, { chatId, k: 5 });
            await sendHtml(ctx, formatRecallHtml(hits, query));
            return true;
        }
        case '/reindex': {
            await ctx.reply('reindexing vault…');
            const result = await reindexVault();
            await sendHtml(ctx, formatReindexResultHtml(result));
            return true;
        }
        case '/builtins':
        case '/routine':
        case '/routines': {
            await sendHtml(ctx, routinesHtml());
            return true;
        }
        case '/mirror-thesis': {
            const force = parts.includes('--force');
            await ctx.reply(`mirroring thesis${force ? ' (force)' : ''}…`);
            const result = await mirrorThesis({ force });
            await sendHtml(ctx, formatMirrorResultHtml(result));
            return true;
        }
        case '/capture': {
            const body = text.replace(/^\/capture\s*/i, '').trim();
            if (!body) {
                await ctx.reply('usage: /capture <text>');
                return true;
            }
            await routeAndReply(ctx, body);
            return true;
        }
        case '/note':
            return await forcedCapture(ctx, text, 'note', '/note <text>');
        case '/idea':
            return await forcedCapture(ctx, text, 'idea', '/idea <text>');
        case '/task':
            return await forcedCapture(ctx, text, 'task', '/task <text>');
        case '/task-add': {
            const body = text.replace(/^\/task-add\s*/i, '').trim();
            if (!body) {
                await ctx.reply('usage: /task-add <text>');
                return true;
            }
            await routeAndReply(ctx, body, 'task');
            const result = await pushPendingTasks();
            if (result.pushed && result.pushed > 0)
                await ctx.reply(`synced ${result.pushed} Google Task${result.pushed > 1 ? 's' : ''}.`);
            return true;
        }
        case '/task-list': {
            const rows = taskRows(20);
            const lines = rows.length === 0
                ? '<i>no tasks tracked</i>'
                : rows.map(r => {
                    const due = r.due_ts ? new Date(r.due_ts).toLocaleDateString('en-IN') : 'no due';
                    return `• <code>${escapeHtml(shortTaskId(r.id))}</code> ${escapeHtml(r.title)} · <i>${escapeHtml(r.status)}</i> · ${escapeHtml(due)}`;
                }).join('\n');
            await sendHtml(ctx, `<b>Google Tasks</b> · ${rows.length}\n${lines}`);
            return true;
        }
        case '/task-done': {
            const id = parts[1];
            if (!id) {
                await ctx.reply('usage: /task-done <id>');
                return true;
            }
            const ok = await completeTask(id);
            await ctx.reply(ok ? `completed ${id}` : `task not found: ${id}`);
            return true;
        }
        case '/thesis':
            return await forcedCapture(ctx, text, 'thesis_fragment', '/thesis <text>');
        case '/literature':
            return await forcedCapture(ctx, text, 'literature', '/literature <text>');
        case '/journal':
            return await forcedCapture(ctx, text, 'journal', '/journal <text>');
        case '/nudge': {
            const flags = await todayFlags();
            if (!flags) {
                await ctx.reply('could not load daily note.');
                return true;
            }
            await sendHtml(ctx, formatNudgeHtml(computeNudges(flags)));
            return true;
        }
        case '/schedule': {
            const sub = parts[1]?.toLowerCase();
            if (!sub || sub === 'list') {
                const rows = scheduledTaskSummary();
                await sendHtml(ctx, `<b>Scheduled tasks</b>\n${rows.map(r => `<code>${escapeHtml(r)}</code>`).join('\n') || '<i>none</i>'}`);
                return true;
            }
            if (sub === 'pause' && parts[2]) {
                const ok = setTaskStatus(parts[2], 'paused');
                await ctx.reply(ok ? `paused ${parts[2]}` : `not found: ${parts[2]}`);
                return true;
            }
            if (sub === 'resume' && parts[2]) {
                const ok = setTaskStatus(parts[2], 'active');
                await ctx.reply(ok ? `resumed ${parts[2]}` : `not found: ${parts[2]}`);
                return true;
            }
            if (sub === 'delete' && parts[2]) {
                const ok = deleteScheduledTask(parts[2]);
                await ctx.reply(ok ? `deleted ${parts[2]}` : `not found: ${parts[2]}`);
                return true;
            }
            await ctx.reply('usage: /schedule list | pause <name> | resume <name> | delete <name>');
            return true;
        }
        case '/mission': {
            const sub = parts[1]?.toLowerCase();
            if (sub === 'run' && parts[2]) {
                await ctx.reply(`running mission ${parts[2]}…`);
                try {
                    const result = await executeMission({
                        mission: parts[2],
                        source: 'telegram',
                        chatId,
                    });
                    if (!result.ok)
                        throw new Error(result.error ?? `mission failed: ${parts[2]}`);
                    await sendHtml(ctx, `<b>${escapeHtml(parts[2])}</b> · ${escapeHtml(result.summary ?? '')}`);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    await ctx.reply(`⚠️ mission error: ${msg.slice(0, 400)}`);
                }
                return true;
            }
            if (!sub || sub === 'list') {
                const rows = listMissionTasks(undefined, 10);
                const lines = rows.length === 0
                    ? '<i>no missions in queue</i>'
                    : rows
                        .map(r => `<code>${escapeHtml(`${r.id}·${r.status}·${r.assigned_agent}·${r.title}`)}</code>`)
                        .join('\n');
                await sendHtml(ctx, `<b>Mission queue</b>\n${lines}`);
                return true;
            }
            await ctx.reply('usage: /mission list | run <name>');
            return true;
        }
        case '/brief': {
            await ctx.reply('composing brief…');
            try {
                const result = await executeMission({
                    mission: 'morning-brief',
                    source: 'telegram',
                    chatId,
                });
                if (!result.ok)
                    throw new Error(result.error ?? 'brief failed');
                logger.info({ summary: result.summary }, 'manual brief run');
            }
            catch (err) {
                await ctx.reply(`⚠️ brief error: ${err instanceof Error ? err.message : String(err)}`);
            }
            return true;
        }
        case '/help': {
            await sendHtml(ctx, [
                '<b>Howl PA commands</b>',
                '<code>/start</code> · <code>/status</code> · <code>/chatid</code> · <code>/newchat</code> · <code>/lock</code>',
                '<code>/capture &lt;text&gt;</code> · <code>/note</code> · <code>/idea</code> · <code>/task</code> · <code>/task-add</code> · <code>/task-list</code> · <code>/task-done</code>',
                '<code>/thesis</code> · <code>/literature</code> · <code>/journal</code>',
                '<code>/recall &lt;query&gt;</code> · <code>/reindex</code> · <code>/mirror-thesis [--force]</code>',
                '<code>/brief</code> · <code>/nudge</code> · <code>/routines</code> · <code>/schedule list|pause|resume|delete</code> · <code>/mission list|run</code>',
                '<code>/ask [backend] &lt;prompt&gt;</code> · <code>/council [aggregator] &lt;prompt&gt;</code> · <code>/backends</code>',
            ].join('\n'));
            return true;
        }
        case '/ask': {
            const rest = text.split(/\s+/).slice(1);
            let backend;
            if (rest[0] && BACKENDS[rest[0]]) {
                backend = rest.shift();
            }
            const prompt = rest.join(' ').trim();
            if (!prompt) {
                await ctx.reply('usage: /ask [claude|codex|ollama:<model>] <prompt>');
                return true;
            }
            await ctx.reply('thinking…');
            const outcome = await dispatchSubagent({ prompt, chatId, hints: [] }, { mode: 'single', forcedBackend: backend });
            await sendHtml(ctx, `<b>${escapeHtml(outcome.backendsUsed[0] ?? 'agent')}</b> · <i>${(outcome.durationMs / 1000).toFixed(1)}s</i>\n\n${escapeHtml(outcome.final)}`);
            return true;
        }
        case '/council': {
            const rest = text.split(/\s+/).slice(1);
            let aggregator;
            if (rest[0] && ['merge', 'best-of-n', 'vote'].includes(rest[0])) {
                aggregator = rest.shift();
            }
            const prompt = rest.join(' ').trim();
            if (!prompt) {
                await ctx.reply('usage: /council [merge|best-of-n|vote] <prompt>');
                return true;
            }
            await ctx.reply(`assembling council${aggregator ? ` (${aggregator})` : ''}…`);
            const outcome = await dispatchSubagent({ prompt, chatId, hints: ['reasoning'] }, { mode: 'council', aggregator });
            const memberLines = outcome.members
                .map(r => `• <code>${escapeHtml(r.backend)}</code> ${r.error ? `⚠️ ${escapeHtml(r.error.slice(0, 80))}` : `ok (${(r.durationMs / 1000).toFixed(1)}s)`}`)
                .join('\n');
            await sendHtml(ctx, `<b>Council</b> · winner <code>${escapeHtml(outcome.winner ?? '?')}</code> · ${(outcome.durationMs / 1000).toFixed(1)}s\n${memberLines}\n\n${escapeHtml(outcome.final)}`);
            return true;
        }
        case '/backends': {
            await sendHtml(ctx, `<b>Available backends</b>\n${availableBackends().map(b => `• <code>${escapeHtml(b)}</code>`).join('\n')}`);
            return true;
        }
        case '/ideas': {
            const parked = listParkedIdeas();
            const body = parked.length === 0
                ? '<i>no parked ideas</i>'
                : parked
                    .map(p => `• <code>${escapeHtml(p.slug)}</code>${p.title ? ` — ${escapeHtml(p.title)}` : ''}`)
                    .join('\n');
            await sendHtml(ctx, `<b>Parked ideas</b> · ${parked.length}\n${body}\n\n<i>/open &lt;slug&gt; · /discard &lt;slug&gt;</i>`);
            return true;
        }
        case '/open': {
            const slug = parts[1];
            const override = parts.slice(2).join(' ').trim() || undefined;
            if (!slug) {
                await ctx.reply('usage: /open <slug> [name override]');
                return true;
            }
            try {
                const outcome = await openIdea(slug, override);
                await sendHtml(ctx, `<b>Opened</b> · <code>${escapeHtml(outcome.projectPath)}</code>\nPipeline → Projects ${outcome.projectNumber}. Title: <i>${escapeHtml(outcome.title)}</i>.`);
            }
            catch (err) {
                await ctx.reply(`⚠️ open error: ${err instanceof Error ? err.message : String(err)}`);
            }
            return true;
        }
        case '/discard': {
            const slug = parts[1];
            if (!slug) {
                await ctx.reply('usage: /discard <slug>');
                return true;
            }
            try {
                const outcome = await discardIdea(slug);
                await sendHtml(ctx, `archived <code>${escapeHtml(outcome.archivedPath)}</code>`);
            }
            catch (err) {
                await ctx.reply(`⚠️ discard error: ${err instanceof Error ? err.message : String(err)}`);
            }
            return true;
        }
        default:
            return false;
    }
}
function commandAllowedWhileLocked(text) {
    const cmd = text.trim().split(/\s+/)[0]?.toLowerCase();
    return cmd === '/start' || cmd === '/chatid' || cmd === '/status';
}
async function forcedCapture(ctx, text, type, usage) {
    const body = text.split(/\s+/).slice(1).join(' ').trim();
    if (!body) {
        await ctx.reply(`usage: ${usage}`);
        return true;
    }
    await routeAndReply(ctx, body, type);
    return true;
}
async function routeAndReply(ctx, body, forcedType) {
    await ctx.reply(forcedType === 'idea' ? '💡 building rundown…' : '📥 capturing…');
    try {
        const outcome = await routeCapture(body, forcedType);
        if (!outcome) {
            await ctx.reply('capture failed: classifier returned nothing.');
            return;
        }
        if (outcome.type === 'ephemeral') {
            await sendHtml(ctx, `<i>ephemeral — not written.</i> <code>${escapeHtml(outcome.classification.slug)}</code>`);
            return;
        }
        await sendHtml(ctx, `<b>Captured</b> as <code>${escapeHtml(outcome.type)}</code> → <code>${escapeHtml(outcome.vaultRel)}</code>` +
            (outcome.classification.title ? `\n<i>${escapeHtml(outcome.classification.title)}</i>` : ''));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err }, 'capture route failed');
        await ctx.reply(`⚠️ capture error: ${msg.slice(0, 400)}`).catch(() => { });
    }
}
// Send a message as Telegram HTML; fall back to plain text if Telegram rejects.
async function sendHtml(ctx, html) {
    for (const chunk of splitMessage(html, 4000)) {
        try {
            await ctx.reply(chunk, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        }
        catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : err }, 'HTML reply failed; falling back to plain');
            const plain = chunk.replace(/<[^>]+>/g, '');
            await ctx.reply(plain).catch(() => { });
        }
    }
}
async function handlePinAttempt(ctx, text) {
    if (!isSecurityEnabled() || !isLocked())
        return false;
    const pin = text.trim();
    // Not a PIN attempt — defer to the locked-mode allowlist gate downstream
    // so commands like /start and /status remain reachable while locked.
    if (!/^\d{4,12}$/.test(pin))
        return false;
    const chatId = String(ctx.chat.id);
    if (unlock(pin, chatId)) {
        await ctx.reply('✅ unlocked.');
    }
    else {
        await ctx.reply('❌ wrong PIN.');
    }
    return true;
}
async function handleKillPhraseCheck(ctx, text) {
    if (!matchesKillPhrase(text))
        return false;
    const chatId = String(ctx.chat.id);
    await ctx.reply('🛑 kill phrase acknowledged. shutting down.');
    await executeEmergencyKill(chatId);
    return true;
}
async function processMessage(ctx, text) {
    const chatId = String(ctx.chat.id);
    checkIdleLock();
    touchActivity();
    if (await handleKillPhraseCheck(ctx, text))
        return;
    if (await handlePinAttempt(ctx, text))
        return;
    if (isSecurityEnabled() && isLocked() && !commandAllowedWhileLocked(text)) {
        audit('blocked', 'message while locked', { chatId, blocked: true });
        await ctx.reply('locked. send PIN.');
        return;
    }
    // Active survey takes precedence over command parsing — user can still
    // /cancel by typing `cancel` inside a survey.
    if (isSurveyActive(chatId) && !text.trim().startsWith('/')) {
        const send = async (html) => { await sendHtml(ctx, html); };
        const handled = await handleSurveyReply(chatId, text, send);
        if (handled)
            return;
    }
    try {
        if (await handleCommand(ctx, text)) {
            audit('command', text.split(/\s+/)[0] ?? '', { chatId });
            return;
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, chatId, cmd: text.split(/\s+/)[0] }, 'command handler threw');
        await ctx.reply(`⚠️ command error: ${msg.slice(0, 400)}`).catch(() => { });
        audit('command', `error: ${msg.slice(0, 200)}`, { chatId, blocked: true });
        return;
    }
    // Inbound exfil scan (audit only — don't reject user; they may paste their own keys).
    const inboundHits = scanForSecrets(text);
    if (inboundHits.length > 0) {
        audit('exfil_redacted', `inbound hits=${inboundHits.map(h => h.type).join(',')}`, { chatId });
    }
    // @agent: delegation syntax — routes through orchestrator.
    const delegation = parseDelegation(text);
    if (delegation) {
        await ctx.replyWithChatAction('typing').catch(() => { });
        try {
            const outcome = await routeDelegation(delegation, chatId);
            const redacted = redactSecrets(outcome.text);
            const header = `<b>@${escapeHtml(delegation.agentId)}</b> · <i>${outcome.backend ?? '—'} · ${(outcome.durationMs / 1000).toFixed(1)}s</i>`;
            await sendHtml(ctx, `${header}\n\n${escapeHtml(redacted.text)}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.reply(`⚠️ delegation error: ${msg.slice(0, 400)}`).catch(() => { });
        }
        return;
    }
    await ctx.replyWithChatAction('typing').catch(() => { });
    try {
        const previousSessionId = latestSessionFor(chatId) ?? undefined;
        const eventSessionId = previousSessionId ?? 'pending';
        chatEvents.emit('message_received', { chatId, sessionId: eventSessionId, text });
        chatEvents.emit('agent_started', {
            chatId,
            sessionId: eventSessionId,
            agentId: 'main',
            backend: 'claude',
        });
        const result = await runAgentWithRetry({
            chatId,
            prompt: text,
            sessionId: previousSessionId,
        });
        if (!previousSessionId) {
            chatEvents.emit('session_start', { chatId, sessionId: result.sessionId, agentId: 'main' });
        }
        const redacted = redactSecrets(result.text);
        if (redacted.matches.length > 0) {
            audit('exfil_redacted', `outbound blocked=${redacted.matches.map(m => m.type).join(',')}`, {
                chatId,
                blocked: true,
            });
        }
        const body = redacted.text + costFooter(result);
        for (const chunk of splitMessage(body)) {
            await ctx.reply(chunk).catch(async (err) => {
                logger.error({ err, chunkLen: chunk.length }, 'telegram reply failed');
            });
        }
        audit('message', `agent reply ok (${result.durationMs}ms)`, { chatId });
        chatEvents.emit('agent_completed', {
            chatId,
            sessionId: result.sessionId,
            durationMs: result.durationMs,
            tokens: result.inputTokens + result.outputTokens,
            outcome: 'ok',
        });
    }
    catch (err) {
        logger.error({ err, chatId }, 'agent run failed');
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.reply(`⚠️ agent error: ${msg.slice(0, 400)}`).catch(() => { });
        audit('message', `agent error: ${msg.slice(0, 200)}`, { chatId });
        chatEvents.emit('chat_error', {
            chatId,
            category: 'agent',
            message: msg.slice(0, 400),
        });
    }
}
export function createBot() {
    const bot = new Bot(TELEGRAM_BOT_TOKEN);
    bot.on('message:text', async (ctx) => {
        const chatId = String(ctx.chat.id);
        if (!isAuthorised(chatId)) {
            logger.warn({ chatId }, 'drop non-allowlisted sender');
            return;
        }
        const text = ctx.message.text;
        enqueue(chatId, () => processMessage(ctx, text));
    });
    bot.catch(err => {
        if (err.error instanceof GrammyError) {
            logger.error({ err: err.error.description }, 'grammy error');
        }
        else {
            logger.error({ err: err.error }, 'unhandled bot error');
        }
    });
    return bot;
}
//# sourceMappingURL=bot.js.map
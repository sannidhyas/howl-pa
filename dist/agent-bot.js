import { Bot, GrammyError } from 'grammy';
import { ALLOWED_CHAT_ID, discoverAgentBotTokens } from './config.js';
import { logger } from './logger.js';
import { executeEmergencyKill, isLocked, isSecurityEnabled, matchesKillPhrase, touchActivity, unlock, } from './security.js';
import { audit } from './db.js';
import { parseDelegation, routeDelegation, agentExists, ensureHiveMindSchema } from './orchestrator.js';
import { redactSecrets } from './exfiltration-guard.js';
import { escapeHtml } from './format-telegram.js';
const MAX_TEXT = 4096;
function splitMessage(text, limit = MAX_TEXT) {
    if (text.length <= limit)
        return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > limit) {
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
async function sendHtml(ctx, html) {
    for (const chunk of splitMessage(html, 4000)) {
        try {
            await ctx.reply(chunk, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        }
        catch {
            const plain = chunk.replace(/<[^>]+>/g, '');
            await ctx.reply(plain).catch(() => { });
        }
    }
}
function isAuthorised(chatId) {
    return String(chatId) === String(ALLOWED_CHAT_ID);
}
async function handleSpecialistMessage(ctx, agentId, text) {
    const chatId = String(ctx.chat.id);
    touchActivity();
    if (matchesKillPhrase(text)) {
        await ctx.reply('🛑 kill phrase acknowledged. shutting down.');
        await executeEmergencyKill(chatId);
        return;
    }
    if (isSecurityEnabled() && isLocked()) {
        if (/^\d{4,12}$/.test(text.trim())) {
            if (unlock(text.trim(), chatId)) {
                await ctx.reply('✅ unlocked.');
            }
            else {
                await ctx.reply('❌ wrong PIN.');
            }
            return;
        }
        await ctx.reply('locked. send PIN to the main bot first.');
        return;
    }
    // Cross-agent delegation still works inside specialist bots, too.
    const delegation = parseDelegation(text);
    const effectiveAgent = delegation?.agentId ?? agentId;
    const prompt = delegation?.prompt ?? text;
    if (delegation && delegation.agentId !== agentId && !agentExists(delegation.agentId)) {
        await ctx.reply(`unknown agent: ${delegation.agentId}`);
        return;
    }
    await ctx.replyWithChatAction('typing').catch(() => { });
    try {
        const outcome = await routeDelegation({ agentId: effectiveAgent, prompt }, chatId);
        const redacted = redactSecrets(outcome.text);
        const header = `<b>@${escapeHtml(effectiveAgent)}</b> · <i>${outcome.backend ?? '—'} · ${(outcome.durationMs / 1000).toFixed(1)}s</i>`;
        await sendHtml(ctx, `${header}\n\n${escapeHtml(redacted.text)}`);
        audit('delegation', `${effectiveAgent} via ${agentId}-bot`, { chatId, agentId: effectiveAgent });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err, agentId, chatId }, 'specialist delegation failed');
        await ctx.reply(`⚠️ error: ${msg.slice(0, 400)}`).catch(() => { });
    }
}
export function makeSpecialistBot(agentId, token) {
    const bot = new Bot(token);
    bot.on('message:text', async (ctx) => {
        const chatId = String(ctx.chat.id);
        if (!isAuthorised(chatId)) {
            logger.warn({ agentId, chatId }, 'specialist drop non-allowlisted sender');
            return;
        }
        const text = ctx.message.text;
        await handleSpecialistMessage(ctx, agentId, text);
    });
    bot.catch(err => {
        if (err.error instanceof GrammyError) {
            logger.error({ agentId, err: err.error.description }, 'specialist grammy error');
        }
        else {
            logger.error({ agentId, err: err.error }, 'unhandled specialist bot error');
        }
    });
    return {
        agentId,
        bot,
        async start() {
            void bot.start({
                drop_pending_updates: true,
                onStart: info => logger.info({ agentId, username: info.username }, 'specialist bot online'),
            });
        },
        async stop() {
            try {
                await bot.stop();
            }
            catch {
                /* swallow */
            }
        },
    };
}
export async function startAllSpecialistBots() {
    ensureHiveMindSchema();
    const tokens = discoverAgentBotTokens();
    const handles = [];
    for (const { agentId, token } of tokens) {
        if (!agentExists(agentId)) {
            logger.warn({ agentId }, `TELEGRAM_BOT_TOKEN_${agentId.toUpperCase()} set but no agent scaffold. Run \`npm run howl agent:create ${agentId}\`.`);
            continue;
        }
        const handle = makeSpecialistBot(agentId, token);
        await handle.start();
        handles.push(handle);
    }
    return handles;
}
//# sourceMappingURL=agent-bot.js.map
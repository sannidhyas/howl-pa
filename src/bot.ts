import { Bot, GrammyError, type Context } from 'grammy'
import { ALLOWED_CHAT_ID, SHOW_COST_FOOTER, TELEGRAM_BOT_TOKEN } from './config.js'
import { logger } from './logger.js'
import {
  executeEmergencyKill,
  isLocked,
  isSecurityEnabled,
  lock,
  matchesKillPhrase,
  touchActivity,
  unlock,
} from './security.js'
import { redactSecrets, scanForSecrets } from './exfiltration-guard.js'
import { runAgentWithRetry } from './agent.js'
import { audit, latestSessionFor } from './db.js'
import { recall } from './memory.js'
import { reindexVault } from './vault-indexer.js'
import { mirrorThesis } from './thesis-mirror.js'
import {
  formatMirrorResultHtml,
  formatRecallHtml,
  formatReindexResultHtml,
} from './format-telegram.js'

const MAX_TELEGRAM_TEXT = 4096

type ChatQueue = Array<() => Promise<void>>
const queues = new Map<string, ChatQueue>()
const processing = new Set<string>()

function enqueue(chatId: string, job: () => Promise<void>): void {
  if (!queues.has(chatId)) queues.set(chatId, [])
  queues.get(chatId)!.push(job)
  void drain(chatId)
}

async function drain(chatId: string): Promise<void> {
  if (processing.has(chatId)) return
  processing.add(chatId)
  try {
    const queue = queues.get(chatId)
    if (!queue) return
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) continue
      try {
        await job()
      } catch (err) {
        logger.error({ err, chatId }, 'queued job failed')
      }
    }
  } finally {
    processing.delete(chatId)
  }
}

export function splitMessage(text: string, limit = MAX_TELEGRAM_TEXT): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    // Prefer the last paragraph break, then newline, then space, then hard cut.
    const para = rest.lastIndexOf('\n\n', limit)
    const line = rest.lastIndexOf('\n', limit)
    const space = rest.lastIndexOf(' ', limit)
    const cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks
}

export function isAuthorised(chatId: string | number): boolean {
  return String(chatId) === String(ALLOWED_CHAT_ID)
}

function costFooter(result: { inputTokens: number; outputTokens: number; costUsd?: number; durationMs: number; toolCallsUsed: number; model?: string }): string {
  switch (SHOW_COST_FOOTER) {
    case 'off':
      return ''
    case 'cost':
      return result.costUsd !== undefined
        ? `\n\n— $${result.costUsd.toFixed(4)} (${result.durationMs}ms)`
        : ''
    case 'full':
      return `\n\n— ${result.model ?? 'claude'} · ${result.inputTokens}/${result.outputTokens} tok · ${result.durationMs}ms · tools:${result.toolCallsUsed}${result.costUsd ? ` · $${result.costUsd.toFixed(4)}` : ''}`
    case 'verbose':
      return `\n\n— ${result.inputTokens + result.outputTokens} tok · ${(result.durationMs / 1000).toFixed(1)}s`
    case 'compact':
    default:
      return `\n\n— ${Math.round((result.inputTokens + result.outputTokens) / 1000)}k · ${(result.durationMs / 1000).toFixed(1)}s`
  }
}

async function handleCommand(ctx: Context, text: string): Promise<boolean> {
  const chatId = String(ctx.chat!.id)
  const parts = text.trim().split(/\s+/)
  const cmd = parts[0]?.toLowerCase()

  switch (cmd) {
    case '/start':
      await ctx.reply(
        `Howl PA is online.\n\n` +
          (isSecurityEnabled() && isLocked()
            ? `Locked. DM your PIN to unlock.`
            : `Ready. Send a message to begin.`)
      )
      return true
    case '/chatid':
      await ctx.reply(`chat_id: \`${chatId}\``, { parse_mode: 'MarkdownV2' }).catch(() => ctx.reply(`chat_id: ${chatId}`))
      return true
    case '/status': {
      const sessionId = latestSessionFor(chatId) ?? '(none)'
      await ctx.reply(
        `status:\n` +
          `• locked: ${isLocked()}\n` +
          `• security enabled: ${isSecurityEnabled()}\n` +
          `• latest session: ${sessionId}`
      )
      return true
    }
    case '/newchat':
      // Next user message starts fresh — signaled by absence of resume target.
      await ctx.reply('new session on next message.')
      return true
    case '/lock':
      lock('user_requested', chatId)
      await ctx.reply('locked.')
      return true
    case '/recall': {
      const query = parts.slice(1).join(' ').trim()
      if (!query) {
        await ctx.reply('usage: /recall <query>')
        return true
      }
      const hits = await recall(query, { chatId, k: 5 })
      await sendHtml(ctx, formatRecallHtml(hits, query))
      return true
    }
    case '/reindex': {
      await ctx.reply('reindexing vault…')
      const result = await reindexVault()
      await sendHtml(ctx, formatReindexResultHtml(result))
      return true
    }
    case '/mirror-thesis': {
      const force = parts.includes('--force')
      await ctx.reply(`mirroring thesis${force ? ' (force)' : ''}…`)
      const result = await mirrorThesis({ force })
      await sendHtml(ctx, formatMirrorResultHtml(result))
      return true
    }
    default:
      return false
  }
}

// Send a message as Telegram HTML; fall back to plain text if Telegram rejects.
async function sendHtml(ctx: Context, html: string): Promise<void> {
  for (const chunk of splitMessage(html, 4000)) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'HTML reply failed; falling back to plain')
      const plain = chunk.replace(/<[^>]+>/g, '')
      await ctx.reply(plain).catch(() => {})
    }
  }
}

async function handlePinAttempt(ctx: Context, text: string): Promise<boolean> {
  if (!isSecurityEnabled() || !isLocked()) return false
  const chatId = String(ctx.chat!.id)
  const pin = text.trim()
  if (!/^\d{4,12}$/.test(pin)) {
    await ctx.reply('locked. send PIN (4-12 digits).')
    return true
  }
  if (unlock(pin, chatId)) {
    await ctx.reply('✅ unlocked.')
  } else {
    await ctx.reply('❌ wrong PIN.')
  }
  return true
}

async function handleKillPhraseCheck(ctx: Context, text: string): Promise<boolean> {
  if (!matchesKillPhrase(text)) return false
  const chatId = String(ctx.chat!.id)
  await ctx.reply('🛑 kill phrase acknowledged. shutting down.')
  await executeEmergencyKill(chatId)
  return true
}

async function processMessage(ctx: Context, text: string): Promise<void> {
  const chatId = String(ctx.chat!.id)
  touchActivity()

  if (await handleKillPhraseCheck(ctx, text)) return
  try {
    if (await handleCommand(ctx, text)) {
      audit('command', text.split(/\s+/)[0] ?? '', { chatId })
      return
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err, chatId, cmd: text.split(/\s+/)[0] }, 'command handler threw')
    await ctx.reply(`⚠️ command error: ${msg.slice(0, 400)}`).catch(() => {})
    audit('command', `error: ${msg.slice(0, 200)}`, { chatId, blocked: true })
    return
  }
  if (await handlePinAttempt(ctx, text)) return
  if (isSecurityEnabled() && isLocked()) {
    audit('blocked', 'message while locked', { chatId, blocked: true })
    await ctx.reply('locked. send PIN.')
    return
  }

  // Inbound exfil scan (audit only — don't reject user; they may paste their own keys).
  const inboundHits = scanForSecrets(text)
  if (inboundHits.length > 0) {
    audit('exfil_redacted', `inbound hits=${inboundHits.map(h => h.type).join(',')}`, { chatId })
  }

  await ctx.replyWithChatAction('typing').catch(() => {})

  try {
    const previousSessionId = latestSessionFor(chatId) ?? undefined
    const result = await runAgentWithRetry({
      chatId,
      prompt: text,
      sessionId: previousSessionId,
    })
    const redacted = redactSecrets(result.text)
    if (redacted.matches.length > 0) {
      audit('exfil_redacted', `outbound blocked=${redacted.matches.map(m => m.type).join(',')}`, {
        chatId,
        blocked: true,
      })
    }
    const body = redacted.text + costFooter(result)
    for (const chunk of splitMessage(body)) {
      await ctx.reply(chunk).catch(async err => {
        logger.error({ err, chunkLen: chunk.length }, 'telegram reply failed')
      })
    }
    audit('message', `agent reply ok (${result.durationMs}ms)`, { chatId })
  } catch (err) {
    logger.error({ err, chatId }, 'agent run failed')
    const msg = err instanceof Error ? err.message : String(err)
    await ctx.reply(`⚠️ agent error: ${msg.slice(0, 400)}`).catch(() => {})
    audit('message', `agent error: ${msg.slice(0, 200)}`, { chatId })
  }
}

export function createBot(): Bot {
  const bot = new Bot(TELEGRAM_BOT_TOKEN)

  bot.on('message:text', async ctx => {
    const chatId = String(ctx.chat.id)
    if (!isAuthorised(chatId)) {
      logger.warn({ chatId }, 'drop non-allowlisted sender')
      return
    }
    const text = ctx.message.text
    enqueue(chatId, () => processMessage(ctx, text))
  })

  bot.catch(err => {
    if (err.error instanceof GrammyError) {
      logger.error({ err: err.error.description }, 'grammy error')
    } else {
      logger.error({ err: err.error }, 'unhandled bot error')
    }
  })

  return bot
}

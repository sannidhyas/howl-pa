import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  ALLOWED_CHAT_ID,
  IS_DEV,
  LOCK_PATH,
  PROJECT_ROOT,
  SECURITY_ENABLED,
  STORE_DIR,
} from './config.js'
import { logger } from './logger.js'
import { createBot } from './bot.js'
import { closeDatabase, initDatabase } from './db.js'
import { registerKillHandler } from './security.js'
import { initScheduler, stopScheduler } from './scheduler.js'

const BANNER = `
┓ ┏      ┓ ┃┓    ┏┓┏┓
┣━┫┏┓┓┏┏┃ ┃┃━━  ┃┃┣━┫
┛ ┛┗┛┗┻┛┗┛┗┛┛   ┣━┻━┛
`

function acquireLock(): void {
  mkdirSync(dirname(LOCK_PATH), { recursive: true })
  if (existsSync(LOCK_PATH)) {
    const stale = Number.parseInt(readFileSync(LOCK_PATH, 'utf8'), 10)
    if (stale > 0 && stale !== process.pid) {
      try {
        process.kill(stale, 0)
        // Stale PID is alive — assume zombie and kill it.
        logger.warn({ stale }, 'killing stale instance')
        process.kill(stale, 'SIGTERM')
      } catch {
        // Not alive — just overwrite.
      }
    }
  }
  writeFileSync(LOCK_PATH, String(process.pid))
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_PATH) && Number.parseInt(readFileSync(LOCK_PATH, 'utf8'), 10) === process.pid) {
      unlinkSync(LOCK_PATH)
    }
  } catch (err) {
    logger.error({ err }, 'failed to release lock')
  }
}

async function main(): Promise<void> {
  if (IS_DEV) process.stderr.write(BANNER)
  logger.info({ root: PROJECT_ROOT, store: STORE_DIR }, 'howl-pa starting')

  acquireLock()
  initDatabase()

  if (!SECURITY_ENABLED) {
    logger.warn('security not configured — run `npm run setup` to set PIN + kill phrase')
  }

  const bot = createBot()

  const send = async (html: string): Promise<void> => {
    const targetChatId = Number.parseInt(String(ALLOWED_CHAT_ID), 10)
    if (!Number.isFinite(targetChatId)) {
      logger.warn({ ALLOWED_CHAT_ID }, 'invalid ALLOWED_CHAT_ID — cannot send scheduled message')
      return
    }
    try {
      await bot.api.sendMessage(targetChatId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'scheduler send (HTML) failed; retrying plain')
      const plain = html.replace(/<[^>]+>/g, '')
      await bot.api.sendMessage(targetChatId, plain).catch(() => {})
    }
  }

  initScheduler({ send, defaultChatId: String(ALLOWED_CHAT_ID) })

  registerKillHandler(async () => {
    stopScheduler()
    await bot.stop()
  })

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    stopScheduler()
    try {
      await bot.stop()
    } catch (err) {
      logger.error({ err }, 'bot.stop failed')
    }
    try {
      closeDatabase()
    } catch (err) {
      logger.error({ err }, 'closeDatabase failed')
    }
    releaseLock()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGHUP', () => void shutdown('SIGHUP'))

  process.on('uncaughtException', err => logger.error({ err }, 'uncaught exception'))
  process.on('unhandledRejection', err => logger.error({ err }, 'unhandled rejection'))

  logger.info('bot polling starting')
  await bot.start({
    onStart: info => logger.info({ username: info.username }, 'telegram bot online'),
  })
}

main().catch(err => {
  logger.error({ err }, 'fatal startup error')
  releaseLock()
  process.exit(1)
})

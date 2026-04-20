import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  IDLE_LOCK_MINUTES,
  KILL_PHRASE,
  PIN_HASH,
  PIN_SALT,
  SECURITY_ENABLED,
} from './config.js'
import { audit } from './db.js'
import { logger } from './logger.js'

type SecurityState = {
  locked: boolean
  lastActivityAt: number
  killHandlers: Array<() => Promise<void> | void>
}

const state: SecurityState = {
  locked: SECURITY_ENABLED,
  lastActivityAt: Date.now(),
  killHandlers: [],
}

export function isSecurityEnabled(): boolean {
  return SECURITY_ENABLED
}

export function isLocked(): boolean {
  return state.locked
}

export function touchActivity(): void {
  state.lastActivityAt = Date.now()
}

export function checkIdleLock(): boolean {
  if (!SECURITY_ENABLED || state.locked) return state.locked
  const idleMs = Date.now() - state.lastActivityAt
  if (idleMs > IDLE_LOCK_MINUTES * 60 * 1000) {
    lock('idle_timeout')
  }
  return state.locked
}

function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

export function verifyPin(pin: string): boolean {
  if (!SECURITY_ENABLED) return true
  const expected = Buffer.from(PIN_HASH, 'hex')
  const candidate = Buffer.from(hashPin(pin, PIN_SALT), 'hex')
  if (expected.length !== candidate.length || expected.length === 0) return false
  try {
    return timingSafeEqual(expected, candidate)
  } catch {
    return false
  }
}

export function unlock(pin: string, chatId?: string): boolean {
  const ok = verifyPin(pin)
  if (ok) {
    state.locked = false
    state.lastActivityAt = Date.now()
    audit('unlock', 'pin accepted', { chatId })
    logger.info({ chatId }, 'security unlocked')
  } else {
    audit('blocked', 'pin rejected', { chatId, blocked: true })
    logger.warn({ chatId }, 'security unlock failed')
  }
  return ok
}

export function lock(reason: string, chatId?: string): void {
  if (!SECURITY_ENABLED) return
  state.locked = true
  audit('lock', reason, { chatId })
  logger.info({ chatId, reason }, 'security locked')
}

export function matchesKillPhrase(text: string): boolean {
  if (!KILL_PHRASE) return false
  return text.trim().toLowerCase() === KILL_PHRASE.trim().toLowerCase()
}

export function registerKillHandler(handler: () => Promise<void> | void): void {
  state.killHandlers.push(handler)
}

export async function executeEmergencyKill(chatId?: string): Promise<void> {
  audit('kill', 'kill phrase triggered', { chatId })
  logger.error({ chatId }, 'EMERGENCY KILL')
  for (const handler of state.killHandlers) {
    try {
      await handler()
    } catch (err) {
      logger.error({ err }, 'kill handler failed')
    }
  }
  // Give handlers 2s to drain, then hard exit.
  setTimeout(() => process.exit(1), 2_000).unref()
}

// Utilities for setup wizard ----------------------------------------------

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export function computePinHash(pin: string, salt: string): string {
  return hashPin(pin, salt)
}

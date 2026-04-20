import pino, { type Logger } from 'pino'
import { IS_DEV, LOG_LEVEL } from './config.js'

const base = {
  level: LOG_LEVEL,
  base: { pid: process.pid },
}

export const logger: Logger = IS_DEV
  ? pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    })
  : pino(base)

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}

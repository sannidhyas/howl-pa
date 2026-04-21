import { createRequire } from 'node:module';
import pino from 'pino';
// Logger reads env directly so it can load in setup scripts that haven't
// populated required config values yet (telegram token etc.).
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const IS_DEV = (process.env.NODE_ENV ?? 'development') !== 'production';
const base = {
    level: LOG_LEVEL,
    base: { pid: process.pid },
};
function hasPinoPretty() {
    try {
        createRequire(import.meta.url).resolve('pino-pretty');
        return true;
    }
    catch {
        return false;
    }
}
export const logger = IS_DEV && hasPinoPretty()
    ? pino({
        ...base,
        transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
    })
    : pino(base);
export function childLogger(bindings) {
    return logger.child(bindings);
}
//# sourceMappingURL=logger.js.map
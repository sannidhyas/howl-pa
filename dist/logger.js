import pino from 'pino';
import { IS_DEV, LOG_LEVEL } from './config.js';
const base = {
    level: LOG_LEVEL,
    base: { pid: process.pid },
};
export const logger = IS_DEV
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
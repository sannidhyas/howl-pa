import { cpSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { logger } from './logger.js';
// Single source of truth for the runtime config directory. Resolution:
//   1. explicit override arg
//   2. HOWL_CONFIG / CLAUDECLAW_CONFIG from process.env
//   3. $XDG_CONFIG_HOME/howl-pa
//   4. ~/.claudeclaw (legacy, only if already present)
//   5. ~/.config/howl-pa (fallback)
// Keep this in sync with config.ts; both call here.
export function resolveConfigDir(override) {
    const explicit = override ?? process.env.HOWL_CONFIG ?? process.env.CLAUDECLAW_CONFIG;
    if (explicit)
        return expandPath(explicit) ?? explicit;
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg)
        return join(xdg, 'howl-pa');
    const legacy = join(homedir(), '.claudeclaw');
    if (existsSync(legacy))
        return legacy;
    return join(homedir(), '.config', 'howl-pa');
}
export function migrateLegacyConfigDir() {
    try {
        if (process.env.HOWL_CONFIG || process.env.CLAUDECLAW_CONFIG)
            return;
        const legacy = join(homedir(), '.claudeclaw');
        const newPath = join(homedir(), '.config', 'howl-pa');
        const legacyExists = existsSync(legacy);
        const newPathExists = existsSync(newPath);
        if (legacyExists && newPathExists) {
            logger.warn('legacy ~/.claudeclaw still present; active config is ~/.config/howl-pa');
            return;
        }
        if (!legacyExists || newPathExists)
            return;
        try {
            renameSync(legacy, newPath);
            logger.info({ from: legacy, to: newPath }, 'migrated legacy config dir');
        }
        catch (err) {
            const code = err.code;
            if (code !== 'EXDEV')
                throw err;
            cpSync(legacy, newPath, { recursive: true });
            rmSync(legacy, { recursive: true, force: true });
            logger.info({ from: legacy, to: newPath }, 'migrated legacy config dir');
        }
    }
    catch (err) {
        logger.warn({ err }, 'failed to migrate legacy config dir');
    }
}
const LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
function parseEnvText(text) {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
        if (!raw || raw.startsWith('#'))
            continue;
        const m = LINE_RE.exec(raw);
        if (!m || !m[1])
            continue;
        let value = m[2] ?? '';
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[m[1]] = value;
    }
    return out;
}
export function expandPath(p) {
    if (!p)
        return p;
    if (p.startsWith('~/'))
        return join(homedir(), p.slice(2));
    if (p === '~')
        return homedir();
    return p;
}
// Load order (later wins for present keys): shell env -> project .env -> config dir .env.
// Shell env wins because it's how operators inject secrets in CI/systemd.
export function loadEnv(opts) {
    const merged = {};
    const configDir = resolveConfigDir(opts.configDir);
    const configEnvPath = join(configDir, '.env');
    const projectEnvPath = join(opts.projectDir, '.env');
    for (const path of [configEnvPath, projectEnvPath]) {
        if (!path || !existsSync(path))
            continue;
        try {
            Object.assign(merged, parseEnvText(readFileSync(path, 'utf8')));
        }
        catch {
            // missing or unreadable file — skip silently, config.ts will error on required keys
        }
    }
    for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined)
            merged[k] = v;
    }
    return merged;
}
export function projectRootFrom(importMetaUrl) {
    // src/env.ts -> project root is one dir up.
    const filePath = new URL(importMetaUrl).pathname;
    return resolve(filePath, '..', '..');
}
//# sourceMappingURL=env.js.map
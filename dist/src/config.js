import { expandPath, loadEnv, projectRootFrom } from './env.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
export const PROJECT_ROOT = projectRootFrom(import.meta.url);
const raw = loadEnv({ projectDir: PROJECT_ROOT });
// Mirror the merged env into process.env so libraries that read directly
// (googleapis OAuth, baileys, etc.) see the same values without each
// module needing to re-implement .env parsing.
for (const [k, v] of Object.entries(raw)) {
    if (process.env[k] === undefined)
        process.env[k] = v;
}
export const rawEnv = raw;
function required(key) {
    const v = raw[key];
    if (v === undefined || v === '') {
        throw new Error(`missing required env var: ${key}`);
    }
    return v;
}
function optional(key, fallback = '') {
    return raw[key] ?? fallback;
}
function intOpt(key, fallback) {
    const v = raw[key];
    if (v === undefined || v === '')
        return fallback;
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n))
        throw new Error(`env ${key} must be integer; got ${v}`);
    return n;
}
function bool(key, fallback) {
    const v = raw[key]?.toLowerCase();
    if (v === undefined || v === '')
        return fallback;
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
function enumOpt(key, values, fallback) {
    const v = raw[key];
    if (!v)
        return fallback;
    if (!values.includes(v))
        throw new Error(`env ${key} must be one of ${values.join('|')}; got ${v}`);
    return v;
}
// Core — required for bot to start
export const TELEGRAM_BOT_TOKEN = required('TELEGRAM_BOT_TOKEN');
export const ALLOWED_CHAT_ID = required('ALLOWED_CHAT_ID');
export const CLAUDE_CODE_OAUTH_TOKEN = required('CLAUDE_CODE_OAUTH_TOKEN');
// Agent behaviour
export const AGENT_TIMEOUT_MS = intOpt('AGENT_TIMEOUT_MS', 900_000);
export const AGENT_MAX_TURNS = intOpt('AGENT_MAX_TURNS', 30);
export const SHOW_COST_FOOTER = enumOpt('SHOW_COST_FOOTER', ['compact', 'verbose', 'cost', 'full', 'off'], 'compact');
// Security — optional; absent PIN_HASH means security layer is in "unlocked" mode until user runs setup
export const PIN_HASH = optional('PIN_HASH');
export const PIN_SALT = optional('PIN_SALT');
export const IDLE_LOCK_MINUTES = intOpt('IDLE_LOCK_MINUTES', 30);
export const KILL_PHRASE = optional('KILL_PHRASE');
// Paths
// Resolution order for the runtime config dir (where OAuth tokens and bot
// state live):
//   1. CLAUDECLAW_CONFIG / HOWL_CONFIG (explicit override)
//   2. $XDG_CONFIG_HOME/howl-pa (preferred when shipped as an npm package)
//   3. ~/.claudeclaw (legacy default; auto-detected if it already exists)
//   4. ~/.config/howl-pa (fallback for Linux without XDG set)
function resolveConfigDir() {
    const explicit = optional('HOWL_CONFIG') ?? optional('CLAUDECLAW_CONFIG');
    if (explicit)
        return expandPath(explicit) ?? explicit;
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg)
        return join(xdg, 'howl-pa');
    const legacy = expandPath('~/.claudeclaw');
    if (legacy && existsSync(legacy))
        return legacy;
    const home = process.env.HOME;
    return home ? join(home, '.config', 'howl-pa') : (expandPath('~/.claudeclaw') ?? '~/.claudeclaw');
}
export const CLAUDECLAW_CONFIG = resolveConfigDir();
export const VAULT_PATH = expandPath(optional('VAULT_PATH', '~/Documents/vault')) ?? '~/Documents/vault';
export const STORE_DIR = join(PROJECT_ROOT, 'store');
export const DB_PATH = join(STORE_DIR, 'howl.db');
export const LOCK_PATH = join(STORE_DIR, 'claudeclaw.pid');
// Observability
export const LOG_LEVEL = optional('LOG_LEVEL', 'info');
export const NODE_ENV = optional('NODE_ENV', 'development');
export const IS_DEV = NODE_ENV !== 'production';
// Subagent router hints that force Claude instead of Codex
export const CLAUDE_HINTS = ['ui', 'ux', 'design', 'visual', 'layout', 'css', 'mockup'];
// Explicit export for feature toggles that ride on env presence
export const SECURITY_ENABLED = PIN_HASH !== '' && PIN_SALT !== '';
export const DEBUG_ACKNOWLEDGE = bool('DEBUG_ACKNOWLEDGE', false);
export function discoverAgentBotTokens() {
    const out = [];
    const prefix = 'TELEGRAM_BOT_TOKEN_';
    for (const [k, v] of Object.entries(raw)) {
        if (!k.startsWith(prefix) || !v)
            continue;
        const id = k.slice(prefix.length).toLowerCase();
        if (!/^[a-z0-9_-]{2,30}$/.test(id))
            continue;
        out.push({ agentId: id, token: v });
    }
    return out;
}
//# sourceMappingURL=config.js.map
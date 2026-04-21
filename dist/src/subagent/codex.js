import { spawn } from 'node:child_process';
import { logger } from '../logger.js';
const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const DEFAULT_TIMEOUT_MS = 900_000;
function parseTokenUsage(text) {
    const m = /tokens used\s*(\d[\d,]*)/i.exec(text);
    if (!m || !m[1])
        return {};
    const n = Number.parseInt(m[1].replace(/,/g, ''), 10);
    return Number.isFinite(n) ? { total: n } : {};
}
function stripBanner(raw) {
    // Codex CLI prints a header ("model: ...", "provider: ...") and a trailing "tokens used" line.
    // Extract the body between the "codex" label and "tokens used" line, or return raw if unstructured.
    const codexIdx = raw.lastIndexOf('\ncodex\n');
    const tokensIdx = raw.indexOf('\ntokens used\n');
    const start = codexIdx >= 0 ? codexIdx + '\ncodex\n'.length : 0;
    const end = tokensIdx >= 0 ? tokensIdx : raw.length;
    return raw.slice(start, end).trim();
}
export class CodexBackend {
    name = 'codex';
    async run(input) {
        const start = Date.now();
        const timeoutMs = (input.timeoutMs ?? Number.parseInt(process.env.CODEX_TIMEOUT_MS ?? '', 10)) || DEFAULT_TIMEOUT_MS;
        const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', input.prompt];
        const result = { backend: this.name, text: '', durationMs: 0 };
        return await new Promise((resolve) => {
            const child = spawn(CODEX_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            const stdout = [];
            const stderr = [];
            const timer = setTimeout(() => {
                child.kill('SIGKILL');
                result.error = `codex timeout after ${timeoutMs}ms`;
            }, timeoutMs);
            timer.unref();
            child.stdout.on('data', chunk => stdout.push(chunk));
            child.stderr.on('data', chunk => stderr.push(chunk));
            child.on('error', err => {
                clearTimeout(timer);
                result.error = err.message;
                result.durationMs = Date.now() - start;
                resolve(result);
            });
            child.on('close', code => {
                clearTimeout(timer);
                const raw = Buffer.concat(stdout).toString('utf8');
                const errTxt = Buffer.concat(stderr).toString('utf8').trim();
                result.durationMs = Date.now() - start;
                if (code !== 0 && !result.error) {
                    result.error = `codex exit ${code}: ${errTxt.slice(0, 400)}`;
                    result.text = stripBanner(raw);
                    resolve(result);
                    return;
                }
                const body = stripBanner(raw);
                const usage = parseTokenUsage(raw);
                result.text = body;
                result.outputTokens = usage.total;
                if (result.error)
                    logger.warn({ err: result.error }, 'codex partial');
                resolve(result);
            });
        });
    }
}
//# sourceMappingURL=codex.js.map
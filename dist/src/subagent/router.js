import { listMemories, recordSubagentRun } from '../db.js';
import { logger } from '../logger.js';
import { ClaudeBackend } from './claude.js';
import { CodexBackend } from './codex.js';
import { OllamaBackend } from './ollama.js';
import { runCouncil } from './aggregator.js';
const DESIGN_HINTS = new Set(['ui', 'ux', 'design', 'visual', 'layout', 'css', 'mockup']);
// Ordered — evaluate top to bottom, first match wins. Frontend-visual sits
// above backend so design hints route to Claude via pickSingleBackend.
const ROLE_RULES = [
    { role: 'frontend-visual', hints: ['ui', 'ux', 'design', 'visual', 'layout', 'css', 'mockup', 'animation', 'typography', 'brand'] },
    { role: 'debugger', hints: ['debug', 'bug', 'root-cause', 'stack-trace'], keywords: /\b(debug|bugfix|stack trace|root cause|exception|crash)\b/i },
    { role: 'refactor', hints: ['refactor', 'restructure', 'rename'], keywords: /\b(refactor|restructure|rename|clean up)\b/i },
    { role: 'tests', hints: ['test', 'tests', 'testing', 'unit-test', 'e2e'], keywords: /\b(unit test|e2e test|jest|vitest|pytest|test coverage)\b/i },
    { role: 'reviewer', hints: ['review', 'code-review', 'pr-review'], keywords: /\b(code review|pr review|review this)\b/i },
    { role: 'security', hints: ['security', 'vuln', 'audit', 'harden'], keywords: /\b(vulnerabilit|security audit|sql injection|xss|csrf|cve)\b/i },
    { role: 'data', hints: ['sql', 'etl', 'migration', 'ml', 'pipeline', 'query'], keywords: /\b(sql|etl|migration|dataset|dataframe)\b/i },
    { role: 'infra', hints: ['docker', 'ci', 'cd', 'k8s', 'terraform', 'iac', 'deploy'], keywords: /\b(dockerfile|kubernetes|terraform|github actions|ci\/cd|deploy)\b/i },
    { role: 'research', hints: ['research', 'explore', 'library', 'survey'], keywords: /\b(research|survey|compare libraries|explore)\b/i },
    { role: 'docs', hints: ['docs', 'documentation', 'readme', 'api-ref'], keywords: /\b(readme|documentation|api reference|docstring)\b/i },
    { role: 'arch', hints: ['arch', 'architecture', 'design-doc'], keywords: /\b(architecture|design doc|system design)\b/i },
    { role: 'perf', hints: ['perf', 'performance', 'profile', 'optimize'], keywords: /\b(perform|optimi[sz]e|benchmark|profiling)\b/i },
    { role: 'migrate', hints: ['migrate', 'upgrade', 'port'], keywords: /\b(migrate|upgrade from|port to|v\d+ to v\d+)\b/i },
    { role: 'integrate', hints: ['integrate', 'integration', 'sdk', 'api-client', 'webhook'], keywords: /\b(integrate|webhook|third-party|sdk|api client)\b/i },
    { role: 'prompt', hints: ['prompt', 'prompt-engineer'], keywords: /\b(prompt engineer|system prompt)\b/i },
    { role: 'route', hints: ['route', 'dispatch'] },
    { role: 'oneshot', hints: ['oneshot', 'one-shot'] },
    { role: 'frontend-logic', hints: ['frontend-logic', 'state', 'hooks', 'data-flow'], keywords: /\b(react state|hook|redux|zustand|signals?)\b/i },
    { role: 'backend', hints: ['backend', 'api', 'service', 'endpoint'], keywords: /\b(endpoint|api route|service layer|business logic)\b/i },
];
export function inferRole(input) {
    const hints = new Set((input.hints ?? []).map(h => h.toLowerCase()));
    const prompt = input.prompt;
    for (const rule of ROLE_RULES) {
        if (rule.hints && rule.hints.some(h => hints.has(h)))
            return rule.role;
        if (rule.keywords && rule.keywords.test(prompt))
            return rule.role;
    }
    return 'do';
}
const claude = new ClaudeBackend();
const codex = new CodexBackend();
const ollamaModels = (process.env.OLLAMA_MODELS ?? 'qwen2.5-coder:3b,ministral-3:latest,hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:TQ1_0')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const ollama = new Map();
for (const m of ollamaModels)
    ollama.set(m, new OllamaBackend(m));
const BACKENDS = {
    claude,
    codex,
    ...Object.fromEntries([...ollama.entries()].map(([m, b]) => [`ollama:${m}`, b])),
};
export function availableBackends() {
    return Object.keys(BACKENDS);
}
function pickSingleBackend(input, forced) {
    if (forced && BACKENDS[forced])
        return BACKENDS[forced];
    const hints = (input.hints ?? []).map(h => h.toLowerCase());
    const lowerPrompt = input.prompt.toLowerCase();
    const isDesign = hints.some(h => DESIGN_HINTS.has(h)) ||
        [...DESIGN_HINTS].some(h => lowerPrompt.includes(` ${h} `));
    return isDesign ? claude : codex;
}
function detectMode(input, opts) {
    if (opts.mode)
        return opts.mode;
    const hints = (input.hints ?? []).map(h => h.toLowerCase());
    if (hints.includes('idea') || hints.includes('reasoning') || hints.includes('plan'))
        return 'council';
    return 'single';
}
function resolveMembers(names, fallback) {
    const list = (names ?? fallback).map(n => BACKENDS[n]).filter((b) => Boolean(b));
    return list.length > 0 ? list : [codex, claude];
}
function pickCouncilMembers(input, opts) {
    if (opts.members && opts.members.length > 0)
        return opts.members;
    const hints = (input.hints ?? []).map(h => h.toLowerCase());
    const list = [];
    if (hints.includes('idea') || hints.includes('plan')) {
        list.push('codex', 'claude');
        const firstOllama = [...ollama.keys()][0];
        if (firstOllama)
            list.push(`ollama:${firstOllama}`);
        return list;
    }
    if (hints.includes('code') || hints.includes('refactor') || hints.includes('debug')) {
        list.push('codex');
        if (ollama.has('qwen2.5-coder:3b'))
            list.push('ollama:qwen2.5-coder:3b');
        else {
            const firstOllama = [...ollama.keys()][0];
            if (firstOllama)
                list.push(`ollama:${firstOllama}`);
        }
        return list;
    }
    list.push('claude', 'codex');
    const firstOllama = [...ollama.keys()][0];
    if (firstOllama)
        list.push(`ollama:${firstOllama}`);
    return list;
}
function resolveJudge(opts, fallback = 'claude') {
    const name = opts.judge ?? process.env.COUNCIL_JUDGE ?? fallback;
    return BACKENDS[name] ?? claude;
}
function defaultAggregator(input, opts) {
    if (opts.aggregator)
        return opts.aggregator;
    const hints = (input.hints ?? []).map(h => h.toLowerCase());
    if (hints.includes('vote'))
        return 'vote';
    if (hints.includes('idea') || hints.includes('research') || hints.includes('summary'))
        return 'merge';
    return 'best-of-n';
}
const SYSTEM_MEMORY_LIMIT = 2000;
function renderSystemMemories() {
    const memories = [...listMemories('global'), ...listMemories('agent_hint')];
    if (memories.length === 0)
        return '';
    const lines = memories.map(m => {
        const value = m.value.replace(/\s+/g, ' ').trim();
        const line = `${m.scope}.${m.key}: ${value}`;
        return line.length > 500 ? `${line.slice(0, 497)}...` : line;
    });
    let block = '';
    for (const [idx, line] of lines.entries()) {
        const candidate = block ? `${block}\n${line}` : line;
        if (candidate.length > SYSTEM_MEMORY_LIMIT) {
            const omitted = lines.length - idx;
            const suffix = `\n...${omitted} more entries omitted`;
            const room = SYSTEM_MEMORY_LIMIT - suffix.length;
            return `${block.slice(0, Math.max(0, room)).trimEnd()}${suffix}`.trim();
        }
        block = candidate;
    }
    return block;
}
function prependSystemMemories(input) {
    const memBlock = renderSystemMemories();
    if (!memBlock)
        return input;
    return {
        ...input,
        prompt: `[System context]\n${memBlock}\n\n[Task]\n${input.prompt}`,
    };
}
export async function dispatchSubagent(input, opts = {}) {
    const start = Date.now();
    const mode = detectMode(input, opts);
    const role = inferRole(input);
    const promptPreview = input.prompt.slice(0, 240);
    const runInput = prependSystemMemories(input);
    if (mode === 'single') {
        const backend = pickSingleBackend(input, opts.forcedBackend);
        const result = await backend.run(runInput).catch(err => ({
            backend: backend.name,
            text: '',
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
        }));
        recordSubagentRun({
            chatId: input.chatId,
            mode,
            backend: backend.name,
            role,
            hints: (input.hints ?? []).join(','),
            promptPreview,
            durationMs: result.durationMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            outcome: result.error ? 'error' : 'ok',
        });
        return {
            final: result.error ? `⚠️ ${backend.name}: ${result.error}` : result.text,
            mode,
            role,
            backendsUsed: [backend.name],
            winner: backend.name,
            members: [result],
            durationMs: Date.now() - start,
        };
    }
    const memberNames = pickCouncilMembers(input, opts);
    const members = resolveMembers(memberNames, memberNames);
    const judge = resolveJudge(opts);
    const aggregator = defaultAggregator(input, opts);
    logger.info({ aggregator, role, members: members.map(m => m.name), judge: judge.name }, 'council dispatch');
    const outcome = await runCouncil({ input: runInput, members, aggregator, judge });
    const backendsUsed = members.map(m => m.name);
    const fullOk = outcome.members.every(r => !r.error);
    recordSubagentRun({
        chatId: input.chatId,
        mode,
        backend: backendsUsed.join('|'),
        role,
        judge: judge.name,
        hints: (input.hints ?? []).join(','),
        promptPreview,
        durationMs: Date.now() - start,
        outcome: fullOk ? 'ok' : 'partial',
    });
    return {
        final: outcome.final,
        mode,
        role,
        backendsUsed,
        winner: outcome.winner,
        members: outcome.members,
        durationMs: Date.now() - start,
    };
}
export { BACKENDS };
//# sourceMappingURL=router.js.map
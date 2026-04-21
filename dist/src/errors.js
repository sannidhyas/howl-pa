const CATEGORY_PATTERNS = [
    [/401|unauthori[sz]ed|forbidden|invalid.*(api|token|key)/i, 'auth'],
    [/429|rate.?limit|too many requests|quota/i, 'rate_limit'],
    [/context.*(length|window|exhaust)|max.*tokens|input too long/i, 'context_exhausted'],
    [/timeout|ETIMEDOUT|ETIMEOUT|timed out/i, 'timeout'],
    [/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket hang up/i, 'network'],
    [/tool.*(error|failed)|bad tool input/i, 'tool_error'],
    // SDK result failure subtypes are terminal for this run; don't retry.
    [/error_during_execution|error_max_turns|error_max_budget/i, 'tool_error'],
    [/abort|cancelled|canceled/i, 'user_abort'],
];
export function classifyError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const [re, cat] of CATEGORY_PATTERNS) {
        if (re.test(msg))
            return cat;
    }
    return 'unknown';
}
export function isRetryable(cat) {
    return cat === 'rate_limit' || cat === 'timeout' || cat === 'network';
}
export function describeError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { category: classifyError(err), message: msg };
}
//# sourceMappingURL=errors.js.map
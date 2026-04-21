import { query } from '@anthropic-ai/claude-agent-sdk';
const DEFAULT_TIMEOUT_MS = 900_000;
export class ClaudeBackend {
    name = 'claude';
    async run(input) {
        const start = Date.now();
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        timer.unref();
        const options = {
            model: 'claude-sonnet-4-6',
            permissionMode: 'bypassPermissions',
            maxTurns: 10,
            settingSources: [],
            abortController: ac,
        };
        const result = { backend: this.name, text: '', durationMs: 0 };
        try {
            for await (const msg of query({ prompt: input.prompt, options })) {
                if (msg.type === 'system' && msg.subtype === 'init')
                    result.sessionId = msg.session_id;
                if (msg.type === 'result') {
                    if (msg.subtype === 'success') {
                        result.text = msg.result;
                        result.durationMs = msg.duration_ms;
                        result.costUsd = msg.total_cost_usd;
                        result.inputTokens = msg.usage.input_tokens ?? 0;
                        result.outputTokens = msg.usage.output_tokens ?? 0;
                    }
                    else {
                        result.error = `claude: ${msg.subtype}`;
                    }
                }
                if (msg.type === 'assistant') {
                    const content = msg.message?.content;
                    if (Array.isArray(content)) {
                        result.toolCallsUsed = (result.toolCallsUsed ?? 0) + content.filter(c => c.type === 'tool_use').length;
                    }
                }
            }
        }
        catch (err) {
            result.error = err instanceof Error ? err.message : String(err);
        }
        finally {
            clearTimeout(timer);
        }
        if (result.durationMs === 0)
            result.durationMs = Date.now() - start;
        return result;
    }
}
//# sourceMappingURL=claude.js.map
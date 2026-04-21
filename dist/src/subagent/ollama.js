import { logger } from '../logger.js';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 900_000;
export class OllamaBackend {
    name;
    model;
    constructor(model) {
        this.model = model;
        this.name = `ollama:${model}`;
    }
    async run(input) {
        const start = Date.now();
        const result = { backend: this.name, text: '', durationMs: 0 };
        const timeoutMs = (input.timeoutMs ?? Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '', 10)) || DEFAULT_TIMEOUT_MS;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        timer.unref();
        try {
            const res = await fetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                signal: ac.signal,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: input.prompt }],
                    stream: false,
                    // Force full GPU offload; Ollama still falls back to CPU if the
                    // model genuinely doesn't fit. Prevents silent CPU spills on
                    // borderline-sized models.
                    options: { num_gpu: -1 },
                }),
            });
            if (!res.ok) {
                result.error = `ollama HTTP ${res.status}`;
            }
            else {
                const body = (await res.json());
                result.text = body.message?.content?.trim() ?? '';
                result.inputTokens = body.prompt_eval_count;
                result.outputTokens = body.eval_count;
            }
        }
        catch (err) {
            result.error = err instanceof Error ? err.message : String(err);
            logger.warn({ err: result.error, model: this.model }, 'ollama backend failed');
        }
        finally {
            clearTimeout(timer);
        }
        result.durationMs = Date.now() - start;
        if (!result.text && !result.error)
            result.error = 'ollama: empty response';
        return result;
    }
}
//# sourceMappingURL=ollama.js.map
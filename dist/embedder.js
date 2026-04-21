import { logger } from './logger.js';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const HEALTH_TIMEOUT_MS = 2_000;
const EMBED_TIMEOUT_MS = 15_000;
export const EMBED_DIMS = 768;
let lastHealth = { at: 0, ok: false };
async function withTimeout(p, ms) {
    return await Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
}
export async function embedderHealthy(force = false) {
    const now = Date.now();
    if (!force && now - lastHealth.at < 30_000)
        return lastHealth.ok;
    try {
        const res = await withTimeout(fetch(`${OLLAMA_URL}/api/tags`), HEALTH_TIMEOUT_MS);
        lastHealth = { at: now, ok: res.ok };
    }
    catch {
        lastHealth = { at: now, ok: false };
    }
    return lastHealth.ok;
}
export async function embed(text) {
    if (!(await embedderHealthy())) {
        logger.warn('ollama embedder unhealthy — returning null');
        return null;
    }
    try {
        const res = await withTimeout(fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
        }), EMBED_TIMEOUT_MS);
        if (!res.ok) {
            logger.warn({ status: res.status }, 'embed HTTP error');
            return null;
        }
        const json = (await res.json());
        if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
            logger.warn('embed: empty response');
            return null;
        }
        return new Float32Array(json.embedding);
    }
    catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'embed failed');
        return null;
    }
}
export function floatsToBlob(vec) {
    return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}
export function blobToFloats(blob) {
    const copy = new Uint8Array(blob);
    return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}
export function cosineSim(a, b) {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < len; i++) {
        const ai = a[i];
        const bi = b[i];
        dot += ai * bi;
        na += ai * ai;
        nb += bi * bi;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}
//# sourceMappingURL=embedder.js.map
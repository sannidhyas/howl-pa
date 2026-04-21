import { logger } from './logger.js'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
const HEALTH_TIMEOUT_MS = 2_000
const EMBED_TIMEOUT_MS = 15_000
const EMBEDDER_COOLDOWN_MS = Number(process.env.EMBEDDER_COOLDOWN_MS ?? '60000')

export const EMBED_DIMS = 768

let lastHealth: { at: number; ok: boolean } = { at: 0, ok: false }
let _down = false
let _cooldownUntil = 0
let _lastErrMsg = ''

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ])
}

export async function embedderHealthy(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && now - lastHealth.at < 30_000) return lastHealth.ok
  try {
    const res = await withTimeout(fetch(`${OLLAMA_URL}/api/tags`), HEALTH_TIMEOUT_MS)
    if (!res.ok) _lastErrMsg = `health check HTTP ${res.status}`
    lastHealth = { at: now, ok: res.ok }
  } catch (err) {
    _lastErrMsg = err instanceof Error ? err.message : String(err)
    lastHealth = { at: now, ok: false }
  }
  return lastHealth.ok
}

export async function embed(text: string): Promise<Float32Array | null> {
  const now = Date.now()
  if (_down && now < _cooldownUntil) return null

  const previousErrMsg = _lastErrMsg
  if (!(await embedderHealthy())) {
    const lastError = _lastErrMsg || 'health check failed'
    const previousError = previousErrMsg || 'health check failed'
    if (!_down) {
      logger.warn(
        { url: OLLAMA_URL, lastError },
        'ollama embedder down — entering cooldown'
      )
    } else if (lastError !== previousError) {
      logger.warn(
        { url: OLLAMA_URL, lastError },
        'ollama embedder still down — cooldown reset'
      )
    }
    _down = true
    _cooldownUntil = Date.now() + EMBEDDER_COOLDOWN_MS
    return null
  }

  if (_down) {
    logger.info({ url: OLLAMA_URL }, 'ollama embedder recovered')
    _down = false
    _cooldownUntil = 0
    _lastErrMsg = ''
  }

  try {
    const res = await withTimeout(
      fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      }),
      EMBED_TIMEOUT_MS
    )
    if (!res.ok) {
      _lastErrMsg = `embed HTTP ${res.status}`
      logger.warn({ status: res.status }, 'embed HTTP error')
      return null
    }
    const json = (await res.json()) as { embedding?: number[] }
    if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
      _lastErrMsg = 'empty embed response'
      logger.warn('embed: empty response')
      return null
    }
    return new Float32Array(json.embedding)
  } catch (err) {
    _lastErrMsg = err instanceof Error ? err.message : String(err)
    logger.warn({ err: _lastErrMsg }, 'embed failed')
    return null
  }
}

export function floatsToBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength)
}

export function blobToFloats(blob: Uint8Array): Float32Array {
  const copy = new Uint8Array(blob)
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    na += ai * ai
    nb += bi * bi
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

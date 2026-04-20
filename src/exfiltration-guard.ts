// Regex patterns for common secret shapes. Tuned for low false-positive on prose,
// high recall on anything matching a documented token format.

export type SecretMatch = {
  type: string
  preview: string
  start: number
  end: number
  source: 'plain' | 'base64' | 'url'
}

type Pattern = { type: string; re: RegExp }

const PATTERNS: Pattern[] = [
  { type: 'anthropic_api_key', re: /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_\-]{32,}/g },
  { type: 'claude_oauth_token', re: /sk-ant-oat\d{2}-[A-Za-z0-9_\-]{32,}/g },
  { type: 'openai_api_key', re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}/g },
  { type: 'aws_access_key', re: /(?<![A-Z0-9])A(?:KIA|SIA|ROA|IDA|NPA|GPA|KIA)[0-9A-Z]{16}(?![A-Z0-9])/g },
  { type: 'aws_secret_key', re: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])(?=[^A-Za-z0-9/+=]|$)/g },
  { type: 'github_token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g },
  { type: 'github_fine_grained', re: /\bgithub_pat_[A-Za-z0-9_]{70,}\b/g },
  { type: 'gcp_service_account', re: /"type":\s*"service_account"[^}]+"private_key":\s*"-----BEGIN/g },
  { type: 'gcp_api_key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { type: 'slack_token', re: /\bxox[abprs]-[0-9A-Za-z\-]{10,}\b/g },
  { type: 'stripe_secret', re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  { type: 'telegram_bot_token', re: /\b\d{8,11}:[A-Za-z0-9_\-]{30,}\b/g },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { type: 'private_key_pem', re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g },
  { type: 'pgp_private_key', re: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g },
  { type: 'generic_apikey_kv', re: /\b(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{24,}\b/gi },
  { type: 'anthropic_admin', re: /sk-ant-admin\d{2}-[A-Za-z0-9_\-]{32,}/g },
]

const BASE64_CANDIDATE_RE = /\b[A-Za-z0-9+/]{40,}={0,2}\b/g
const URL_ENCODED_RE = /(?:%[0-9A-Fa-f]{2}){8,}/g

function preview(text: string, start: number, end: number): string {
  const head = text.slice(Math.max(0, start - 4), start)
  const mid = text.slice(start, end)
  const tail = text.slice(end, Math.min(text.length, end + 4))
  const masked = mid.length > 8 ? `${mid.slice(0, 4)}…${mid.slice(-3)}` : '***'
  return `${head}${masked}${tail}`
}

function scanPlain(text: string): SecretMatch[] {
  const out: SecretMatch[] = []
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      out.push({
        type,
        preview: preview(text, m.index, m.index + m[0].length),
        start: m.index,
        end: m.index + m[0].length,
        source: 'plain',
      })
    }
  }
  return out
}

function scanBase64(text: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  BASE64_CANDIDATE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BASE64_CANDIDATE_RE.exec(text)) !== null) {
    let decoded: string
    try {
      decoded = Buffer.from(m[0], 'base64').toString('utf8')
    } catch {
      continue
    }
    // Only flag if decoded form contains a known secret pattern.
    const inner = scanPlain(decoded)
    if (inner.length === 0) continue
    for (const hit of inner) {
      matches.push({
        type: hit.type,
        preview: preview(text, m.index, m.index + m[0].length),
        start: m.index,
        end: m.index + m[0].length,
        source: 'base64',
      })
    }
  }
  return matches
}

function scanUrl(text: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  URL_ENCODED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_ENCODED_RE.exec(text)) !== null) {
    let decoded: string
    try {
      decoded = decodeURIComponent(m[0])
    } catch {
      continue
    }
    const inner = scanPlain(decoded)
    if (inner.length === 0) continue
    for (const hit of inner) {
      matches.push({
        type: hit.type,
        preview: preview(text, m.index, m.index + m[0].length),
        start: m.index,
        end: m.index + m[0].length,
        source: 'url',
      })
    }
  }
  return matches
}

export function scanForSecrets(text: string): SecretMatch[] {
  return [...scanPlain(text), ...scanBase64(text), ...scanUrl(text)].sort(
    (a, b) => a.start - b.start
  )
}

export function redactSecrets(text: string): { text: string; matches: SecretMatch[] } {
  const matches = scanForSecrets(text)
  if (matches.length === 0) return { text, matches }
  // Redact from the end so earlier indices stay valid.
  let out = text
  for (const hit of [...matches].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, hit.start)}[REDACTED:${hit.type}]${out.slice(hit.end)}`
  }
  return { text: out, matches }
}

import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from './logger.js'

const SUMMARIZE_MAX_INPUT_CHARS = 20_000
const SUMMARIZE_MAX_TURNS = 4
const SUMMARIZE_TIMEOUT_MS = 180_000

const CALLOUT_PROMPT = `You are adding an Obsidian callout block that slots into a ZotLit literature note for a PhD researcher (Information Systems, trust in AI + technology).

OUTPUT RULES
- Return ONLY the callout block. No preamble, no code fence, no trailing prose.
- Every line of the block MUST start with "> ".
- First line EXACTLY: "> [!howl-summary]"
- Use the ZotLit field syntax \`**Field**:: value\` inside the block.

REQUIRED FIELDS (in this order, one per paragraph with a blank "> " line between)
- Gist  — 3-5 dense sentences on the argument, method and finding.
- Arguments — 3-5 bullets of concrete claims. Use "> - claim" per bullet on separate lines.
- Methodology — 1-2 sentences on approach or data if present; else "not applicable".
- Relevance — explicit tie to trust-in-AI / information-systems research; "None" if genuinely none.
- OpenQuestions — 3 numbered questions to answer next. Use "> 1. ..." per line.
`

export async function summarizeDocument(text: string, hintFilename?: string): Promise<string> {
  const truncated = text.length > SUMMARIZE_MAX_INPUT_CHARS
    ? text.slice(0, SUMMARIZE_MAX_INPUT_CHARS) + `\n\n[truncated — original was ${text.length} chars]`
    : text

  const prompt = `${CALLOUT_PROMPT}\n\n${hintFilename ? `Filename: ${hintFilename}\n\n` : ''}Text:\n---\n${truncated}\n---`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), SUMMARIZE_TIMEOUT_MS)
  timer.unref()

  const options: Options = {
    model: 'claude-sonnet-4-6',
    permissionMode: 'bypassPermissions',
    maxTurns: SUMMARIZE_MAX_TURNS,
    settingSources: [],
    abortController: ac,
  }

  let result = ''
  try {
    for await (const message of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result
      }
    }
  } catch (err) {
    logger.error({ err }, 'summarize failed')
    throw err
  } finally {
    clearTimeout(timer)
  }
  return normalizeCallout(result)
}

// Ensures the text is a well-formed callout block. If the model returned loose
// prose, wrap it. Idempotent when input is already compliant.
function normalizeCallout(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:markdown)?/i, '').replace(/```$/i, '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('> [!howl-summary]')) return trimmed
  const body = trimmed
    .split(/\r?\n/)
    .map(line => (line.startsWith('> ') ? line : `> ${line}`))
    .join('\n')
  return `> [!howl-summary]\n${body}`
}

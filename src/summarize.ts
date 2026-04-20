import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from './logger.js'

const SUMMARIZE_MAX_INPUT_CHARS = 20_000
const SUMMARIZE_MAX_TURNS = 4
const SUMMARIZE_TIMEOUT_MS = 120_000

const SUMMARIZE_PROMPT = `You are summarising an academic document for a personal knowledge base.
Produce STRICT markdown with these exact sections — nothing before or after:

## Summary
One dense paragraph (5-8 sentences) covering the main argument, method, findings, and why it matters.

## Key points
- 5 to 8 bullets, each one concrete claim or fact. No hedging.

## Relevance to trust-in-AI PhD
- 2 to 4 bullets linking the document to trust-in-technology / information-systems research. If no relevance, say "None" on one line.

## Open questions
- 3 to 5 bullets the reader should answer next. Questions only, no answers.

Text follows.
---
`

export async function summarizeDocument(text: string, hintFilename?: string): Promise<string> {
  const truncated = text.length > SUMMARIZE_MAX_INPUT_CHARS
    ? text.slice(0, SUMMARIZE_MAX_INPUT_CHARS) + `\n\n[truncated — original was ${text.length} chars]`
    : text

  const prompt = `${SUMMARIZE_PROMPT}${hintFilename ? `Filename: ${hintFilename}\n---\n` : ''}${truncated}`

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
  return result.trim()
}

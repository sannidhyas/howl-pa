import { google } from 'googleapis'
import { listGmailSince, upsertGmailItem, type GmailItemRow } from './db.js'
import { getAuthedClient, googleAuthConfigured, googleTokenSaved } from './google-auth.js'
import { logger } from './logger.js'

const PRIORITY_LABEL = process.env.GMAIL_PRIORITY_LABEL ?? 'howl-priority'

export type PollResult = {
  ok: boolean
  reason?: string
  fetched: number
  stored: number
}

export async function isGmailReady(): Promise<boolean> {
  return googleAuthConfigured() && googleTokenSaved()
}

function headerValue(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string | undefined {
  for (const h of headers) {
    if ((h.name ?? '').toLowerCase() === name.toLowerCase()) return h.value ?? undefined
  }
  return undefined
}

export async function pollPriorityInbox(lookbackHours = 24): Promise<PollResult> {
  if (!(await isGmailReady())) {
    return { ok: false, reason: 'not configured', fetched: 0, stored: 0 }
  }
  const auth = await getAuthedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  const afterSec = Math.floor((Date.now() - lookbackHours * 3600_000) / 1000)
  const q = `label:${PRIORITY_LABEL} after:${afterSec}`
  let listRes
  try {
    listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 30 })
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'gmail list failed')
    return { ok: false, reason: 'list failed', fetched: 0, stored: 0 }
  }
  const msgs = listRes.data.messages ?? []
  let stored = 0
  for (const m of msgs) {
    if (!m.id) continue
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' })
      const headers = msg.data.payload?.headers ?? []
      upsertGmailItem({
        id: m.id,
        threadId: msg.data.threadId ?? undefined,
        sender: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject'),
        snippet: msg.data.snippet ?? undefined,
        internalDate: Number.parseInt(msg.data.internalDate ?? '0', 10) || undefined,
        labels: msg.data.labelIds ?? undefined,
        unread: (msg.data.labelIds ?? []).includes('UNREAD'),
      })
      stored += 1
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err, id: m.id }, 'gmail get failed')
    }
  }
  return { ok: true, fetched: msgs.length, stored }
}

export function gmailSince(sinceMs: number, limit = 10): GmailItemRow[] {
  return listGmailSince(sinceMs, limit)
}

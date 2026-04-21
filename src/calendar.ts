import { google } from 'googleapis'
import { getAuthedClient, googleAuthConfigured, googleTokenSaved } from './google-auth.js'
import { listCalendarEventsBetween, upsertCalendarEvent, type CalendarEventRow } from './db.js'
import { logger } from './logger.js'

export type PollResult = {
  ok: boolean
  reason?: string
  fetched: number
  stored: number
}

export async function isCalendarReady(): Promise<boolean> {
  return googleAuthConfigured() && googleTokenSaved()
}

export async function pollCalendar(lookAheadHours = 36): Promise<PollResult> {
  if (!(await isCalendarReady())) {
    return { ok: false, reason: 'not configured', fetched: 0, stored: 0 }
  }
  const auth = await getAuthedClient()
  const cal = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const timeMin = new Date(now.getTime() - 3600_000).toISOString()
  const timeMax = new Date(now.getTime() + lookAheadHours * 3600_000).toISOString()

  let res
  try {
    res = await cal.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'calendar list failed')
    return { ok: false, reason: 'list failed', fetched: 0, stored: 0 }
  }
  const events = res.data.items ?? []
  let stored = 0
  for (const ev of events) {
    if (!ev.id) continue
    const startMs = toMs(ev.start?.dateTime ?? ev.start?.date ?? null)
    const endMs = toMs(ev.end?.dateTime ?? ev.end?.date ?? null)
    const meetLink = extractMeetLink(ev)
    upsertCalendarEvent({
      id: ev.id,
      summary: ev.summary ?? undefined,
      location: ev.location ?? undefined,
      startsAt: startMs ?? undefined,
      endsAt: endMs ?? undefined,
      htmlLink: ev.htmlLink ?? undefined,
      meetLink,
      attendees: (ev.attendees ?? []).map(a => a.email ?? '').filter(Boolean),
      description: ev.description ?? undefined,
    })
    stored += 1
  }
  return { ok: true, fetched: events.length, stored }
}

export async function createCalendarBlock(args: {
  summary: string
  startsAt: Date
  endsAt: Date
  description?: string
}): Promise<CalendarEventRow | null> {
  if (!(await isCalendarReady())) return null
  const auth = await getAuthedClient()
  const cal = google.calendar({ version: 'v3', auth })
  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startsAt.toISOString() },
      end: { dateTime: args.endsAt.toISOString() },
    },
  })
  const ev = res.data
  if (!ev.id) return null
  const startMs = toMs(ev.start?.dateTime ?? ev.start?.date ?? null)
  const endMs = toMs(ev.end?.dateTime ?? ev.end?.date ?? null)
  const meetLink = extractMeetLink(ev)
  upsertCalendarEvent({
    id: ev.id,
    summary: ev.summary ?? undefined,
    location: ev.location ?? undefined,
    startsAt: startMs ?? undefined,
    endsAt: endMs ?? undefined,
    htmlLink: ev.htmlLink ?? undefined,
    meetLink,
    attendees: (ev.attendees ?? []).map(a => a.email ?? '').filter(Boolean),
    description: ev.description ?? undefined,
  })
  return calendarBetween(startMs ?? args.startsAt.getTime(), (endMs ?? args.endsAt.getTime()) + 1)[0] ?? null
}

function toMs(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function extractMeetLink(ev: {
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> } | null
  hangoutLink?: string | null
}): string | undefined {
  if (ev.hangoutLink) return ev.hangoutLink
  const ep = ev.conferenceData?.entryPoints ?? []
  for (const p of ep) if (p.entryPointType === 'video' && p.uri) return p.uri
  return undefined
}

export function calendarBetween(fromMs: number, toMs: number): CalendarEventRow[] {
  return listCalendarEventsBetween(fromMs, toMs)
}

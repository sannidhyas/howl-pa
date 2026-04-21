import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { google, type Auth } from 'googleapis'
import { resolveConfigDir } from './env.js'
import { logger } from './logger.js'

const TOKEN_FILE = join(resolveConfigDir(), 'google-token.json')
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
]

export function googleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function googleTokenSaved(): boolean {
  return existsSync(TOKEN_FILE)
}

function makeClient(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in ~/.claudeclaw/.env')
  }
  const redirect = process.env.GOOGLE_REDIRECT ?? 'urn:ietf:wg:oauth:2.0:oob'
  return new google.auth.OAuth2(clientId, clientSecret, redirect)
}

export function authUrl(): string {
  const client = makeClient()
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
}

export async function exchangeCode(code: string): Promise<void> {
  const client = makeClient()
  const { tokens } = await client.getToken(code)
  mkdirSync(resolveConfigDir(), { recursive: true, mode: 0o700 })
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
  chmodSync(TOKEN_FILE, 0o600)
  logger.info({ TOKEN_FILE }, 'google token saved')
}

export async function getAuthedClient(): Promise<Auth.OAuth2Client> {
  const client = makeClient()
  if (!existsSync(TOKEN_FILE)) {
    throw new Error(`google token missing: ${TOKEN_FILE} (run scripts/setup-google.ts)`)
  }
  const tokens = JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as Auth.Credentials
  client.setCredentials(tokens)
  // Proactively refresh if access_token close to expiry. googleapis handles it
  // automatically when making API calls, so this is defensive.
  if (tokens.expiry_date && Date.now() > tokens.expiry_date - 60_000 && tokens.refresh_token) {
    try {
      const { credentials } = await client.refreshAccessToken()
      client.setCredentials(credentials)
      writeFileSync(TOKEN_FILE, JSON.stringify(credentials, null, 2))
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'token refresh failed')
    }
  }
  return client
}

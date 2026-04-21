// One-time Google OAuth setup via loopback redirect.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in ~/.claudeclaw/.env
// Run: npm run setup:google

import { createServer } from 'node:http'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { loadEnv, resolveConfigDir } from '../src/env.js'

// Load config/.env + project .env into process.env BEFORE importing
// google-auth (which reads process.env at module scope).
const configDir = resolveConfigDir()
const envPath = join(configDir, '.env')
const merged = loadEnv({ projectDir: process.cwd(), configDir })
for (const [k, v] of Object.entries(merged)) {
  if (process.env[k] === undefined) process.env[k] = v
}

async function promptValue(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  if (!hidden) {
    try { return (await rl.question(question)).trim() } finally { rl.close() }
  }
  process.stdout.write(question)
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  let input = ''
  return new Promise<string>(resolve => {
    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\n' || ch === '\r') {
          process.stdout.write('\n')
          process.stdin.setRawMode?.(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          rl.close()
          resolve(input.trim())
          return
        }
        if (ch === '\x03') { process.stdout.write('\n'); process.exit(130) }
        if (ch === '\x7f') {
          if (input.length > 0) { input = input.slice(0, -1); process.stdout.write('\b \b') }
          continue
        }
        input += ch
        process.stdout.write('*')
      }
    }
    process.stdin.on('data', onData)
  })
}

function upsertEnv(key: string, value: string): void {
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  const next = re.test(existing)
    ? existing.replace(re, line)
    : (existing.endsWith('\n') || existing === '' ? `${existing}${line}\n` : `${existing}\n${line}\n`)
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  writeFileSync(envPath, next, { mode: 0o600 })
  chmodSync(envPath, 0o600)
  process.env[key] = value
}

async function ensureClientCreds(): Promise<void> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return
  console.log('\n── Google OAuth client credentials ──')
  console.log('Create an "OAuth 2.0 Client ID" (type: Desktop app) in Google Cloud Console → APIs & Services → Credentials.')
  console.log(`Values will be written to: ${envPath}\n`)
  if (!process.env.GOOGLE_CLIENT_ID) {
    const id = await promptValue('GOOGLE_CLIENT_ID: ')
    if (!id) { console.error('aborted — client id required'); process.exit(1) }
    upsertEnv('GOOGLE_CLIENT_ID', id)
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    const secret = await promptValue('GOOGLE_CLIENT_SECRET (hidden): ', true)
    if (!secret) { console.error('aborted — client secret required'); process.exit(1) }
    if (!secret.startsWith('GOCSPX-')) {
      console.error('⚠️  warning: typical Google client secrets start with "GOCSPX-". Continuing anyway.')
    }
    upsertEnv('GOOGLE_CLIENT_SECRET', secret)
  }
}

const OAUTH_PORT = Number.parseInt(process.env.GOOGLE_OAUTH_PORT ?? '4141', 10)
const REDIRECT = `http://127.0.0.1:${OAUTH_PORT}/cb`
process.env.GOOGLE_REDIRECT = REDIRECT

const { authUrl, exchangeCode, googleAuthConfigured, googleTokenSaved } = await import(
  '../src/google-auth.js'
)

async function captureCode(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) return
      const u = new URL(req.url, REDIRECT)
      if (u.pathname !== '/cb') {
        res.writeHead(404)
        res.end('not found')
        return
      }
      const err = u.searchParams.get('error')
      if (err) {
        res.writeHead(400, { 'content-type': 'text/html' })
        res.end(`<h2>OAuth error:</h2><pre>${err}</pre>`)
        server.close()
        reject(new Error(`oauth error: ${err}`))
        return
      }
      const code = u.searchParams.get('code')
      if (!code) {
        res.writeHead(400)
        res.end('missing code')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<h2>✅ Howl PA authorised.</h2><p>You can close this tab and return to the terminal.</p>`)
      server.close()
      resolve(code)
    })
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      // nothing — caller already printed the URL
    })
    server.on('error', reject)
    setTimeout(() => {
      server.close()
      reject(new Error('oauth timeout (5 min)'))
    }, 5 * 60 * 1000).unref()
  })
}

async function main(): Promise<void> {
  await ensureClientCreds()
  if (!googleAuthConfigured()) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET after prompt — aborting.')
    process.exit(1)
  }
  if (googleTokenSaved() && !process.argv.includes('--force')) {
    console.log('Token already saved. Use --force to overwrite.')
    process.exit(0)
  }

  console.log(`\nLoopback redirect: ${REDIRECT}`)
  console.log('\nYou MUST add this URI to your OAuth client\'s "Authorized redirect URIs" in')
  console.log('Google Cloud Console → Credentials → <client> → edit → Add URI:')
  console.log(`    ${REDIRECT}`)
  console.log('\nThen open this URL in any browser (same machine):\n')
  console.log('This requests Gmail, Calendar event, and Google Tasks scopes. Use --force to re-consent after upgrading from pre-Tasks builds.\n')
  console.log(authUrl())
  console.log('\nWaiting for callback (5 min timeout)…')

  const code = await captureCode()
  await exchangeCode(code)
  console.log('\n✅ ~/.claudeclaw/google-token.json saved.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

// One-time Google OAuth setup via loopback redirect.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in ~/.claudeclaw/.env
// Run: npm run setup:google

import { createServer } from 'node:http'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { loadEnv, resolveConfigDir } from '../src/env.js'
import ora from 'ora'

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

function renderOAuthPage(args: { ok: boolean; detail?: string }): string {
  const title = args.ok ? 'Howl PA — Google authorised' : 'Howl PA — authorisation error'
  const pillClass = args.ok ? 'ok' : 'err'
  const pillText = args.ok ? 'Signed in' : 'Error'
  const headline = args.ok ? 'Google account linked.' : 'Something went wrong.'
  const body = args.ok
    ? 'You can close this tab and return to the terminal. Gmail, Calendar, and Tasks scopes are now authorised.'
    : `Howl PA could not complete the OAuth exchange.`
  const detail = args.detail ? `<pre class="detail">${args.detail.replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c] ?? c))}</pre>` : ''
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  html,body{height:100%;margin:0;background:#0b0c10;color:#edf0f6;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#13151b;border:1px solid #272b36;border-radius:12px;padding:28px 30px;max-width:440px;width:100%;box-shadow:0 8px 24px rgba(0,0,0,.4);text-align:left}
  .logo{display:inline-flex;align-items:center;gap:10px;color:#7cc5ff;margin-bottom:6px}
  .logo span{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#edf0f6}
  .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:500;margin-left:6px}
  .pill.ok{background:rgba(111,209,154,.14);color:#6fd19a}
  .pill.err{background:rgba(240,138,122,.14);color:#f08a7a}
  h1{margin:12px 0 6px 0;font-size:19px;font-weight:600}
  p{color:#a1a7b5;font-size:13.5px;margin:0 0 14px 0}
  .detail{background:#0b0c10;border:1px solid #272b36;border-radius:6px;padding:10px 12px;font-family:ui-monospace,"JetBrains Mono",SFMono-Regular,monospace;font-size:12px;color:#f08a7a;white-space:pre-wrap;word-break:break-word}
  .hint{margin-top:16px;padding:10px 12px;background:#0b0c10;border:1px solid #272b36;border-radius:6px;font-size:12px;color:#a1a7b5}
  .hint code{color:#7cc5ff;background:#21252f;padding:1px 6px;border-radius:3px;font-family:ui-monospace,"JetBrains Mono",monospace;font-size:11.5px}
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><g fill="currentColor"><path d="M2 4 L24 22 L22 30 L14 26 Z"/><path d="M62 4 L40 22 L42 30 L50 26 Z"/><path d="M14 20 L10 34 L18 48 L30 62 L34 62 L46 48 L54 34 L50 20 L42 26 L34 32 L30 32 L22 26 Z"/></g><g fill="#0b0c10"><path d="M18 28 L28 34 L26 28 Z"/><path d="M46 28 L36 34 L38 28 Z"/><path d="M22 44 L24 50 L27 46 L30 52 L32 46 L34 52 L37 46 L40 50 L42 44 Z"/></g></svg>
<span>Howl PA</span><span class="pill ${pillClass}">${pillText}</span>
</div>
<h1>${headline}</h1>
<p>${body}</p>
${detail}
<div class="hint">Return to the terminal running <code>howl-pa setup:google</code> — the token is being saved.</div>
</div></div></body></html>`
}

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
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(renderOAuthPage({ ok: false, detail: String(err) }))
        server.close()
        reject(new Error(`oauth error: ${err}`))
        return
      }
      const code = u.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(renderOAuthPage({ ok: false, detail: 'missing authorization code' }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(renderOAuthPage({ ok: true }))
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
  const waitSpinner = process.stdout.isTTY ? ora('Waiting for OAuth callback…').start() : undefined
  if (!waitSpinner) console.log('\nWaiting for callback (5 min timeout)…')
  let code: string
  try {
    code = await captureCode()
    waitSpinner?.succeed('OAuth callback received.')
  } catch (err) {
    waitSpinner?.fail('OAuth callback failed.')
    throw err
  }
  await exchangeCode(code)
  console.log('\n✅ ~/.config/howl-pa/google-token.json saved.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

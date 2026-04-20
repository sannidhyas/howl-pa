// One-time Google OAuth setup via loopback redirect.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in ~/.claudeclaw/.env
// Run: npm run setup:google

import { createServer } from 'node:http'
import { loadEnv } from '../src/env.js'

// Load ~/.claudeclaw/.env + project .env into process.env BEFORE importing
// google-auth (which reads process.env at module scope).
const merged = loadEnv({ projectDir: process.cwd() })
for (const [k, v] of Object.entries(merged)) {
  if (process.env[k] === undefined) process.env[k] = v
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
  if (!googleAuthConfigured()) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in ~/.claudeclaw/.env.')
    console.error('GOOGLE_CLIENT_SECRET format: GOCSPX-<random>. If yours does not start with GOCSPX-,')
    console.error('go back to Cloud Console → Credentials → your OAuth client → copy Client secret.')
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

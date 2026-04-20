// One-time Google OAuth setup. Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
// in ~/.claudeclaw/.env. Run: npx tsx scripts/setup-google.ts

import { createInterface } from 'node:readline/promises'
import { authUrl, exchangeCode, googleAuthConfigured, googleTokenSaved } from '../src/google-auth.js'

async function main(): Promise<void> {
  if (!googleAuthConfigured()) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Add to ~/.claudeclaw/.env:')
    console.error('  GOOGLE_CLIENT_ID=...')
    console.error('  GOOGLE_CLIENT_SECRET=...')
    console.error('  GOOGLE_REDIRECT=urn:ietf:wg:oauth:2.0:oob')
    console.error('\nCreate OAuth client at https://console.cloud.google.com → APIs & Services → Credentials.')
    console.error('Enable Gmail API + Calendar API for your project.')
    process.exit(1)
  }
  if (googleTokenSaved()) {
    console.log('Token already saved. Re-run with --force to overwrite.')
    if (!process.argv.includes('--force')) process.exit(0)
  }

  console.log('\nOpen in browser:')
  console.log(authUrl())
  console.log('\nAfter granting, Google shows a code. Paste it below.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = (await rl.question('code: ')).trim()
  rl.close()
  if (!code) {
    console.error('empty code.')
    process.exit(1)
  }
  await exchangeCode(code)
  console.log('✅ google-token.json saved.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

// One-time Baileys pair. Shows QR in terminal; scan from WhatsApp → Linked devices.
// Run: npx tsx scripts/setup-whatsapp.ts

import { startWhatsApp } from '../src/whatsapp.js'

async function main(): Promise<void> {
  console.log('starting baileys pair…')
  await startWhatsApp(true)
  console.log('\nLeave this process running until you see "wa connection open" in the logs.')
  console.log('After first open, Ctrl-C to exit. Bot will reuse the session on next start.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

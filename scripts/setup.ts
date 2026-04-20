import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

function expand(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

const configDir = expand(process.env.CLAUDECLAW_CONFIG ?? '~/.claudeclaw')
const envPath = join(configDir, '.env')

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  if (!hidden) {
    try {
      return (await rl.question(question)).trim()
    } finally {
      rl.close()
    }
  }
  // Minimal hidden-input implementation — stdin raw mode, echo asterisks.
  process.stdout.write(question)
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  let input = ''
  return new Promise<string>(resolve => {
    const onData = (chunk: Buffer): void => {
      const s = chunk.toString('utf8')
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          process.stdout.write('\n')
          process.stdin.setRawMode?.(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          rl.close()
          resolve(input.trim())
          return
        }
        if (ch === '\u0003') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f') {
          if (input.length > 0) {
            input = input.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        input += ch
        process.stdout.write('*')
      }
    }
    process.stdin.on('data', onData)
  })
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw)
    if (!m || !m[1]) continue
    let v = m[2] ?? ''
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

function serializeEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
}

async function main(): Promise<void> {
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const existing: Record<string, string> = existsSync(envPath)
    ? parseEnv(readFileSync(envPath, 'utf8'))
    : {}

  console.log(`Howl PA setup — config dir: ${configDir}`)
  console.log('Leave blank to keep existing values.')
  console.log('')

  const pin = await prompt('PIN (4–12 digits): ', true)
  if (pin && !/^\d{4,12}$/.test(pin)) {
    console.error('❌ PIN must be 4–12 digits.')
    process.exit(1)
  }

  let confirm = ''
  if (pin) {
    confirm = await prompt('Confirm PIN: ', true)
    if (pin !== confirm) {
      console.error('❌ PIN mismatch.')
      process.exit(1)
    }
  }

  const killPhrase = await prompt(
    `Kill phrase (current: ${existing.KILL_PHRASE ? '<set>' : '<unset>'}): `
  )
  const idleStr = await prompt(`Idle lock minutes (current: ${existing.IDLE_LOCK_MINUTES ?? '30'}): `)

  if (pin) {
    const salt = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex')
    existing.PIN_SALT = salt
    existing.PIN_HASH = hash
  }
  if (killPhrase) existing.KILL_PHRASE = killPhrase
  if (idleStr) {
    const n = Number.parseInt(idleStr, 10)
    if (Number.isFinite(n) && n > 0) existing.IDLE_LOCK_MINUTES = String(n)
  }

  if (!existing.DASHBOARD_TOKEN) {
    existing.DASHBOARD_TOKEN = randomBytes(24).toString('base64url')
    console.log(`generated DASHBOARD_TOKEN: ${existing.DASHBOARD_TOKEN}`)
  }

  writeFileSync(envPath, serializeEnv(existing), { mode: 0o600 })
  chmodSync(envPath, 0o600)
  console.log('')
  console.log(`✅ wrote ${envPath}`)
  console.log(
    `   PIN_HASH=${existing.PIN_HASH ? 'set' : 'unset'} · KILL_PHRASE=${existing.KILL_PHRASE ? 'set' : 'unset'} · IDLE_LOCK_MINUTES=${existing.IDLE_LOCK_MINUTES ?? '30'}`
  )
  console.log(`   Dashboard: http://localhost:3141/?token=${existing.DASHBOARD_TOKEN}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

function expand(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

function resolveConfigDir(): string {
  if (process.env.HOWL_CONFIG) return expand(process.env.HOWL_CONFIG)
  if (process.env.CLAUDECLAW_CONFIG) return expand(process.env.CLAUDECLAW_CONFIG)
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, 'howl-pa')
  const legacy = join(homedir(), '.claudeclaw')
  if (existsSync(legacy)) return legacy
  return join(homedir(), '.config', 'howl-pa')
}

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  if (!hidden) {
    try {
      return (await rl.question(question)).trim()
    } finally {
      rl.close()
    }
  }
  process.stdout.write(question)
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  let input = ''
  return new Promise<string>(resolve => {
    const onData = (chunk: Buffer): void => {
      const s = chunk.toString('utf8')
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '') {
          process.stdout.write('\n')
          process.stdin.setRawMode?.(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          rl.close()
          resolve(input.trim())
          return
        }
        if (ch === '') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '') {
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

async function readPassword(): Promise<{ password: string; headless: boolean }> {
  const argvPassword = process.argv[2]
  if (argvPassword !== undefined) return { password: argvPassword, headless: true }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('❌ Password argument required when not running in a TTY.')
    process.exit(1)
  }
  return { password: await prompt('Dashboard password: ', true), headless: false }
}

async function main(): Promise<void> {
  const configDir = resolveConfigDir()
  const envPath = join(configDir, '.env')
  const existing: Record<string, string> = existsSync(envPath)
    ? parseEnv(readFileSync(envPath, 'utf8'))
    : {}

  // Ensure a salt exists: prefer PIN_SALT for consistency with setup.ts,
  // then DASHBOARD_PASSWORD_SALT, else generate a fresh one.
  if (!existing.PIN_SALT && !existing.DASHBOARD_PASSWORD_SALT) {
    existing.DASHBOARD_PASSWORD_SALT = randomBytes(16).toString('hex')
  }

  const { password, headless } = await readPassword()
  if (password.length < 8 || !/\d/.test(password)) {
    console.error('❌ Password must be at least 8 characters and contain at least one digit.')
    process.exit(1)
  }

  if (!headless) {
    const confirm = await prompt('Confirm password: ', true)
    if (password !== confirm) {
      console.error('❌ Passwords do not match.')
      process.exit(1)
    }
  }

  const salt = existing.PIN_SALT ?? existing.DASHBOARD_PASSWORD_SALT!
  existing.DASHBOARD_PASSWORD_HASH = createHash('sha256').update(`${salt}:${password}`).digest('hex')
  if (!existing.DASHBOARD_USERNAME) existing.DASHBOARD_USERNAME = 'howl'

  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  writeFileSync(envPath, serializeEnv(existing), { mode: 0o600 })
  chmodSync(envPath, 0o600)

  const host = existing.DASHBOARD_HOST ?? '127.0.0.1'
  const port = existing.DASHBOARD_PORT ?? '3141'
  console.log('✔ dashboard password set.')
  console.log(`Username: ${existing.DASHBOARD_USERNAME}`)
  console.log(`Sign in at: http://${host}:${port}/`)
  if (host === '127.0.0.1') {
    console.log('Tip: to use this password over a tunnel, set DASHBOARD_HOST=0.0.0.0 and front with Caddy/Cloudflare Tunnel/Tailscale Funnel.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

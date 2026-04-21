import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
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

const configDir = resolveConfigDir()
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

async function maybeUpdate(
  env: Record<string, string>,
  key: string,
  question: string,
  opts: { hidden?: boolean; validator?: (v: string) => true | string } = {}
): Promise<void> {
  const current = env[key]
  const shown = current
    ? opts.hidden
      ? '<set>'
      : current.length > 20
        ? `${current.slice(0, 6)}…${current.slice(-4)}`
        : current
    : '<unset>'
  const value = await prompt(`${question} (current: ${shown}): `, opts.hidden)
  if (!value) return
  if (opts.validator) {
    const ok = opts.validator(value)
    if (ok !== true) {
      console.error(`❌ ${key}: ${ok}`)
      process.exit(1)
    }
  }
  env[key] = value
}

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function preflight(): void {
  console.log('\nPre-flight checks:')
  const node = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  check('Node ≥ 22', node >= 22, process.version)

  const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' })
  const codexOk = codex.status === 0
  check('codex CLI on PATH', codexOk, codexOk ? codex.stdout.trim() : 'install from https://github.com/openai/codex and run `codex login`')

  const ollama = spawnSync('curl', ['-s', '-m', '2', `${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/tags`], { encoding: 'utf8' })
  const ollamaOk = ollama.status === 0 && ollama.stdout.includes('"models"')
  check('Ollama reachable (optional)', ollamaOk, ollamaOk ? 'ok' : 'start with `ollama serve`; pull nomic-embed-text + a chat model')

  console.log('')
}

async function main(): Promise<void> {
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const existing: Record<string, string> = existsSync(envPath)
    ? parseEnv(readFileSync(envPath, 'utf8'))
    : {}

  console.log(`Howl PA setup — config dir: ${configDir}`)
  console.log('Leave blank at any prompt to keep the existing value.\n')

  console.log('── Required credentials ──')
  await maybeUpdate(existing, 'TELEGRAM_BOT_TOKEN', 'Telegram bot token (@BotFather)', {
    hidden: true,
    validator: v => /:.+/.test(v) || 'expected format: <digits>:<secret>',
  })
  await maybeUpdate(existing, 'ALLOWED_CHAT_ID', 'Your Telegram chat ID (@userinfobot)', {
    validator: v => /^-?\d+$/.test(v) || 'expected a positive or negative integer',
  })
  await maybeUpdate(existing, 'CLAUDE_CODE_OAUTH_TOKEN', 'Claude Code OAuth token (`claude setup-token`)', {
    hidden: true,
  })

  console.log('\n── Security ──')
  const pin = await prompt('PIN (4–12 digits; blank to keep): ', true)
  if (pin) {
    if (!/^\d{4,12}$/.test(pin)) {
      console.error('❌ PIN must be 4–12 digits.')
      process.exit(1)
    }
    const confirm = await prompt('Confirm PIN: ', true)
    if (pin !== confirm) {
      console.error('❌ PIN mismatch.')
      process.exit(1)
    }
    const salt = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex')
    existing.PIN_SALT = salt
    existing.PIN_HASH = hash
  }
  await maybeUpdate(existing, 'KILL_PHRASE', 'Kill phrase (typed to shut bot down)')
  await maybeUpdate(existing, 'IDLE_LOCK_MINUTES', 'Idle lock minutes', {
    validator: v => (/^\d+$/.test(v) && Number(v) > 0) || 'positive integer',
  })

  console.log('\n── Paths ──')
  await maybeUpdate(existing, 'VAULT_PATH', 'Obsidian vault path')
  await maybeUpdate(existing, 'THESIS_PATH', 'Thesis/paper drive (blank to skip thesis-mirror)')

  console.log('\n── Dashboard ──')
  if (!existing.DASHBOARD_TOKEN) {
    existing.DASHBOARD_TOKEN = randomBytes(24).toString('base64url')
    console.log(`  generated DASHBOARD_TOKEN`)
  } else {
    console.log('  DASHBOARD_TOKEN already set; keeping.')
  }
  if (!existing.DASHBOARD_PORT) existing.DASHBOARD_PORT = '3141'
  if (!existing.OLLAMA_URL) existing.OLLAMA_URL = 'http://localhost:11434'
  if (!existing.OLLAMA_EMBED_MODEL) existing.OLLAMA_EMBED_MODEL = 'nomic-embed-text'

  // Silently remove any legacy HOWL_PROFILE key so the env stays clean.
  delete existing.HOWL_PROFILE

  writeFileSync(envPath, serializeEnv(existing), { mode: 0o600 })
  chmodSync(envPath, 0o600)

  console.log(`\n✅ wrote ${envPath}`)
  console.log(`   PIN=${existing.PIN_HASH ? 'set' : 'unset'} · KILL_PHRASE=${existing.KILL_PHRASE ? 'set' : 'unset'}`)
  console.log(`   Dashboard: http://localhost:${existing.DASHBOARD_PORT}/?token=${existing.DASHBOARD_TOKEN}`)

  preflight()

  const vault = expand(existing.VAULT_PATH ?? '~/Documents/vault')
  console.log('Next:')
  console.log('  1. Make sure your vault exists:')
  console.log(`       ls ${vault}`)
  console.log('     See docs/vault-conventions.md for the folder structure.')
  console.log('  2. Google OAuth:')
  console.log('       howl-pa setup:google')
  console.log('  3. Launch:')
  console.log('       howl-pa start')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

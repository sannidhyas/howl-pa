#!/usr/bin/env node
// Howl PA CLI entrypoint. Dispatches to compiled dist/ for `start`, and to
// tsx-invoked scripts/*.ts for setup/health operations that are interactive.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = resolve(__dirname, '..')
const distIndex = join(pkgRoot, 'dist', 'index.js')

const USAGE = `howl-pa <command>

Commands:
  start           Launch the bot + scheduler + dashboard (requires build)
  setup           Interactive first-run wizard (PIN, kill phrase, Telegram)
  setup:google    Google OAuth flow for Gmail, Calendar, and Tasks scopes
  health          Print a status report for bot, vault, Google, Ollama
  howl            Project agent CLI (create, list, attach)
  council         Bounce a prompt across the local Ollama council
  version         Print version and exit

Env: set HOWL_CONFIG or CLAUDECLAW_CONFIG to override the config dir.
     Defaults to $XDG_CONFIG_HOME/howl-pa, or ~/.claudeclaw if that exists,
     or ~/.config/howl-pa.
`

function runTsx(script, args) {
  const require = createRequire(import.meta.url)
  let tsxCli
  try {
    tsxCli = require.resolve('tsx/cli', { paths: [pkgRoot] })
  } catch {
    console.error('tsx not installed. Reinstall howl-pa or add tsx as a dev dep.')
    process.exit(1)
  }
  const res = spawnSync(process.execPath, [tsxCli, join(pkgRoot, script), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  process.exit(res.status ?? 1)
}

function runStart(args) {
  if (!existsSync(distIndex)) {
    console.error('dist/index.js missing. Run `npm run build` inside the howl-pa source tree first.')
    process.exit(1)
  }
  const res = spawnSync(process.execPath, ['--enable-source-maps', distIndex, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  process.exit(res.status ?? 0)
}

function printVersion() {
  const require = createRequire(import.meta.url)
  const pkg = require(join(pkgRoot, 'package.json'))
  console.log(pkg.version)
}

const [cmd, ...args] = process.argv.slice(2)

switch (cmd) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(USAGE)
    break
  case 'start':
    runStart(args)
    break
  case 'setup':
    runTsx('scripts/setup.ts', args)
    break
  case 'setup:google':
  case 'google:auth':
    runTsx('scripts/setup-google.ts', args)
    break
  case 'health':
    runTsx('scripts/health.ts', args)
    break
  case 'howl':
  case 'agent':
    runTsx('scripts/howl.ts', args)
    break
  case 'council':
    runTsx('scripts/ollama-council.ts', args)
    break
  case 'version':
  case '--version':
  case '-v':
    printVersion()
    break
  default:
    console.error(`unknown command: ${cmd}\n`)
    process.stdout.write(USAGE)
    process.exit(1)
}

#!/usr/bin/env node
// Howl PA CLI entrypoint. Dispatches to precompiled dist/ scripts for all
// subcommands so a bare `npm i -g` works without tsx or a TypeScript toolchain
// on the target machine.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = resolve(__dirname, '..')
const distRoot = join(pkgRoot, 'dist')

const USAGE = `howl-pa <command>

Commands:
  start           Launch the bot + scheduler + dashboard
  setup           Interactive first-run wizard (PIN, kill phrase, Telegram)
  setup:google    Google OAuth flow for Gmail, Calendar, and Tasks scopes
  health          Print a status report for bot, vault, Google, Ollama
  howl            Project agent CLI (create, list, attach)
  council         Bounce a prompt across the local Ollama council
  daemon          Manage the howl-pa systemd --user service (install|uninstall|status|logs)
  set-password    Add or update the dashboard password
  version         Print version and exit

Env: set HOWL_CONFIG or CLAUDECLAW_CONFIG to override the config dir.
     Defaults to $XDG_CONFIG_HOME/howl-pa, or ~/.claudeclaw if that exists,
     or ~/.config/howl-pa.
`

function runNode(relPath, args, { sourceMaps = false } = {}) {
  const target = join(distRoot, relPath)
  if (!existsSync(target)) {
    console.error(`dist file missing: ${relPath}`)
    console.error('Reinstall howl-pa, or build from source with `npm run build`.')
    process.exit(1)
  }
  const nodeArgs = sourceMaps ? ['--enable-source-maps', target, ...args] : [target, ...args]
  const res = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', cwd: process.cwd() })
  process.exit(res.status ?? 1)
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
    runNode('src/index.js', args, { sourceMaps: true })
    break
  case 'setup':
    runNode('scripts/setup.js', args)
    break
  case 'setup:google':
  case 'google:auth':
    runNode('scripts/setup-google.js', args)
    break
  case 'health':
    runNode('scripts/health.js', args)
    break
  case 'howl':
  case 'agent':
    runNode('scripts/howl.js', args)
    break
  case 'council':
    runNode('scripts/ollama-council.js', args)
    break
  case 'daemon':
    runNode('scripts/daemon.js', args)
    break
  case 'set-password':
    runNode('scripts/set-password.js', args)
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

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { resolveConfigDir } from '../src/env.js'

const SERVICE_NAME: string = 'howl-pa.service'
const UNIT_FILE: string = join(homedir(), '.config', 'systemd', 'user', SERVICE_NAME)

if (process.platform !== 'linux') {
  console.error('Only Linux/systemd is supported; macOS launchd support is planned.')
  process.exit(2)
}

const [subCmd, ...rest]: [string | undefined, ...string[]] =
  process.argv.slice(2) as [string | undefined, ...string[]]

function usage(): never {
  console.error('Usage: howl-pa daemon install [--force] | uninstall | status | logs [-n N] [-f]')
  process.exit(1)
}

function pathFrom(result: SpawnSyncReturns<string>): string | null {
  if (result.status !== 0) return null
  const rawPath: string = result.stdout.trim()
  if (!rawPath) return null
  return isAbsolute(rawPath) ? rawPath : resolve(rawPath)
}

function resolveHowlPaPath(): string {
  const whichResult: SpawnSyncReturns<string> = spawnSync('which', ['howl-pa'], {
    encoding: 'utf8',
  })
  const whichPath: string | null = pathFrom(whichResult)
  if (whichPath) return whichPath

  const commandResult: SpawnSyncReturns<string> = spawnSync('command -v howl-pa', {
    encoding: 'utf8',
    shell: true,
  })
  const commandPath: string | null = pathFrom(commandResult)
  if (commandPath) return commandPath

  console.error('Unable to locate howl-pa on PATH. Install it first, then retry.')
  process.exit(1)
}

function exitWith(result: SpawnSyncReturns<Buffer>): never {
  process.exit(result.status ?? 1)
}

function runRequired(command: string, args: string[]): void {
  const result: SpawnSyncReturns<Buffer> = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) exitWith(result)
}

function unitContent(nodePath: string, howlPaPath: string, configDir: string): string {
  return `[Unit]
Description=Howl PA — Telegram-first Mission Control
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${nodePath} ${howlPaPath} start
Environment=NODE_ENV=production
Environment=CLAUDECLAW_CONFIG=${configDir}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`
}

function install(args: string[]): void {
  const force: boolean = args.includes('--force')
  if (existsSync(UNIT_FILE) && !force) {
    console.error(`${UNIT_FILE} already exists; use --force to overwrite it.`)
    process.exit(1)
  }

  const nodePath: string = process.execPath
  const howlPaPath: string = resolveHowlPaPath()
  const configDir: string = resolveConfigDir()
  mkdirSync(dirname(UNIT_FILE), { recursive: true })
  writeFileSync(UNIT_FILE, unitContent(nodePath, howlPaPath, configDir), {
    encoding: 'utf8',
    mode: 0o644,
  })

  runRequired('systemctl', ['--user', 'daemon-reload'])
  runRequired('systemctl', ['--user', 'enable', '--now', SERVICE_NAME])
  console.log('Dashboard available once boot completes — check `howl-pa daemon logs` for the URL.')
}

function uninstall(): void {
  if (!existsSync(UNIT_FILE)) {
    console.log('not installed')
    process.exit(0)
  }

  spawnSync('systemctl', ['--user', 'disable', '--now', SERVICE_NAME], { stdio: 'inherit' })
  rmSync(UNIT_FILE)
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' })
  console.log('howl-pa daemon uninstalled')
}

function logArgs(args: string[]): string[] {
  const out: string[] = ['--user', '-u', SERVICE_NAME, '-n', '50']
  for (let index: number = 0; index < args.length; index++) {
    const arg: string = args[index]!
    if (arg === '-f') {
      out.push('-f')
    } else if (arg === '-n') {
      const next: string | undefined = args[index + 1]
      if (!next || !/^[1-9][0-9]*$/.test(next)) {
        console.error('logs requires -n N with a positive integer')
        process.exit(1)
      }
      out[4] = next
      index++
    } else {
      console.error(`unknown logs argument: ${arg}`)
      process.exit(1)
    }
  }
  return out
}

switch (subCmd) {
  case 'install':
    install(rest)
    break
  case 'uninstall':
    uninstall()
    break
  case 'status':
    exitWith(spawnSync('systemctl', ['--user', 'status', SERVICE_NAME, '--no-pager'], {
      stdio: 'inherit',
    }))
    break
  case 'logs':
    exitWith(spawnSync('journalctl', logArgs(rest), { stdio: 'inherit' }))
    break
  default:
    usage()
}

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expandPath, resolveConfigDir } from '../src/env.js'

const CREDENTIAL_FILES = ['.env', 'google-token.json'] as const
const DB_FILES = ['store/howl.db', 'store/howl.db-shm', 'store/howl.db-wal'] as const
const RESTORABLE_FILES = [...CREDENTIAL_FILES, ...DB_FILES] as const
const SERVICE_NAME = 'howl-pa.service'

type CredentialFile = typeof CREDENTIAL_FILES[number]
type DBFile = typeof DB_FILES[number]
type RestorableFile = typeof RESTORABLE_FILES[number]

type Args = {
  out?: string
  restore?: string
  force: boolean
  withData: boolean
}

function usage(): never {
  console.error('Usage: howl-pa backup [--with-data] [--out <path>] [--restore <path>] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { force: false, withData: false }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg) usage()

    if (arg === '--force') {
      parsed.force = true
      continue
    }

    if (arg === '--with-data') {
      parsed.withData = true
      continue
    }

    if (arg === '--out' || arg === '--restore') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) usage()
      if (arg === '--out') parsed.out = value
      else parsed.restore = value
      index++
      continue
    }

    usage()
  }

  if (parsed.out && parsed.restore) usage()
  if (parsed.restore && parsed.withData) usage()
  return parsed
}

function dateStamp(): string {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultBackupPath(): string {
  return join(homedir(), `howl-pa-backup-${dateStamp()}.tgz`)
}

function absolutePath(path: string): string {
  return resolve(expandPath(path) ?? path)
}

function existingCredentialFiles(configDir: string): CredentialFile[] {
  return CREDENTIAL_FILES.filter(file => existsSync(join(configDir, file)))
}

function existingDbFiles(configDir: string): DBFile[] {
  return DB_FILES.filter(file => existsSync(join(configDir, file)))
}

function tarFailed(status: number | null): boolean {
  return status !== 0
}

function isSystemdServiceActive(): boolean {
  const active = spawnSync('systemctl', ['--user', 'is-active', SERVICE_NAME], {
    stdio: 'ignore',
  })
  return active.status === 0
}

function isLivePidFromFile(configDir: string): boolean {
  const pidFile = join(configDir, 'store', 'howl-pa.pid')
  if (!existsSync(pidFile)) return false

  let pidText: string
  try {
    pidText = readFileSync(pidFile, 'utf8').trim()
  } catch {
    return false
  }

  if (!/^\d+$/.test(pidText)) return false

  const pid = Number(pidText)
  if (!Number.isSafeInteger(pid) || pid <= 0) return false

  return existsSync(join('/proc', String(pid)))
}

function isDaemonRunning(configDir: string): boolean {
  return isSystemdServiceActive() || isLivePidFromFile(configDir)
}

function checkpointWalIfDaemonRunning(configDir: string): void {
  if (!isDaemonRunning(configDir)) return

  const dbPath = join(configDir, 'store', 'howl.db')
  if (!existsSync(dbPath)) return

  const result = spawnSync('sqlite3', [dbPath, 'PRAGMA wal_checkpoint(FULL);'], {
    encoding: 'utf8',
  })

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException
    if (error.code === 'ENOENT') {
      console.warn('warning: sqlite3 CLI not found — archive may capture WAL mid-transaction. Stop the daemon first for a consistent snapshot.')
      return
    }

    console.error(error.message)
    console.error('WAL checkpoint failed; backup aborted.')
    process.exit(1)
  }

  if (tarFailed(result.status)) {
    const detail = result.stderr.trim()
    if (detail) console.error(detail)
    console.error('WAL checkpoint failed; backup aborted.')
    process.exit(result.status ?? 1)
  }
}

function logCredentialFile(configDir: string, file: CredentialFile): void {
  const size = statSync(join(configDir, file)).size
  if (file === '.env') {
    console.log(`  .env              (${size} bytes)`)
  } else {
    console.log(`  google-token.json (${size} bytes)`)
  }
}

function logDbFile(configDir: string, file: DBFile): void {
  const filePath = join(configDir, file)
  if (file === 'store/howl.db') {
    if (existsSync(filePath)) {
      console.log(`  store/howl.db     (${statSync(filePath).size} bytes)`)
    } else {
      console.log('  store/howl.db     (not present)')
    }
    return
  }

  const label = file === 'store/howl.db-shm' ? 'store/howl.db-shm' : 'store/howl.db-wal'
  if (existsSync(filePath)) {
    console.log(`  ${label} (optional) (${statSync(filePath).size} bytes)`)
  } else {
    console.log(`  ${label} (optional) (not present)`)
  }
}

function backup(outArg: string | undefined, withData: boolean): void {
  const configDir = resolveConfigDir()
  const outPath = absolutePath(outArg ?? defaultBackupPath())
  const existingFiles = existingCredentialFiles(configDir)

  if (withData) checkpointWalIfDaemonRunning(configDir)

  const dataFiles = withData ? existingDbFiles(configDir) : []
  const includedFiles = [...existingFiles, ...dataFiles]

  if (includedFiles.length === 0) {
    const label = withData ? 'credentials or data' : 'credentials'
    console.error(`No ${label} found in ${configDir}; nothing to back up.`)
    process.exit(1)
  }

  const result = spawnSync('tar', ['-czf', outPath, '-C', configDir, ...includedFiles], {
    stdio: 'inherit',
  })
  if (tarFailed(result.status)) {
    if (result.error) console.error(result.error.message)
    console.error('Backup failed.')
    process.exit(result.status ?? 1)
  }

  chmodSync(outPath, 0o600)

  if (withData) {
    console.log('✔ Howl PA credentials + data backed up.')
  } else {
    console.log('✔ Howl PA credentials backed up.')
  }
  console.log(`Path: ${outPath}`)
  console.log(`Restore: howl-pa backup --restore ${outPath}`)
  console.log('')
  console.log('Included:')

  for (const file of existingFiles) {
    logCredentialFile(configDir, file)
  }

  if (withData) {
    for (const file of DB_FILES) {
      logDbFile(configDir, file)
    }
  } else {
    console.log('\nData NOT included. Add --with-data for the full snapshot (DB + indexes).')
  }
}

function normalizeArchiveEntry(entry: string): RestorableFile | null {
  let normalized = entry.trim()
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  if (RESTORABLE_FILES.includes(normalized as RestorableFile)) {
    return normalized as RestorableFile
  }
  return null
}

function listArchiveEntries(archivePath: string): string[] {
  const result = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
  if (tarFailed(result.status)) {
    const detail = result.stderr.trim()
    if (detail) console.error(detail)
    console.error(`Unable to read backup archive: ${archivePath}`)
    process.exit(result.status ?? 1)
  }

  return result.stdout
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(Boolean)
}

function listRestorableFiles(entries: string[]): RestorableFile[] {
  const included = new Set<RestorableFile>()
  for (const entry of entries) {
    const file = normalizeArchiveEntry(entry)
    if (file) included.add(file)
  }

  return RESTORABLE_FILES.filter(file => included.has(file))
}

function listRestorableArchiveEntries(entries: string[]): string[] {
  const included = new Map<RestorableFile, string>()
  for (const entry of entries) {
    const file = normalizeArchiveEntry(entry)
    if (file && !included.has(file)) included.set(file, entry)
  }

  return RESTORABLE_FILES
    .map(file => included.get(file))
    .filter((entry): entry is string => Boolean(entry))
}

function isCredentialFile(file: RestorableFile): file is CredentialFile {
  return (CREDENTIAL_FILES as readonly string[]).includes(file)
}

function isDbFile(file: RestorableFile): file is DBFile {
  return (DB_FILES as readonly string[]).includes(file)
}

function restore(restoreArg: string, force: boolean): void {
  const configDir = resolveConfigDir()
  const archivePath = absolutePath(restoreArg)

  if (!existsSync(archivePath)) {
    console.error(`Backup archive not found: ${archivePath}`)
    process.exit(1)
  }

  const archiveEntries = listArchiveEntries(archivePath)
  const restorableFiles = listRestorableFiles(archiveEntries)
  const restorableArchiveEntries = listRestorableArchiveEntries(archiveEntries)

  if (restorableFiles.length === 0) {
    console.error(`No restorable credentials or data found in ${archivePath}.`)
    process.exit(1)
  }

  const credentialFiles = restorableFiles.filter(isCredentialFile)
  const dbFiles = restorableFiles.filter(isDbFile)
  const includesData = dbFiles.length > 0
  const filesToProtect: RestorableFile[] = [
    ...credentialFiles,
    ...(includesData ? [...DB_FILES] : []),
  ]

  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  if (includesData) {
    mkdirSync(join(configDir, 'store'), { recursive: true, mode: 0o700 })
  }

  for (const file of filesToProtect) {
    const targetPath = join(configDir, file)
    if (existsSync(targetPath) && !force) {
      console.error(`Existing ${file} at ${targetPath}. Pass --force to overwrite (the current ${file} will be renamed to ${file}.bak-<ts> before restore).`)
      process.exit(1)
    }
  }

  const backupStamp = Date.now()
  for (const file of filesToProtect) {
    const targetPath = join(configDir, file)
    if (existsSync(targetPath)) {
      renameSync(targetPath, `${targetPath}.bak-${backupStamp}`)
    }
  }

  const result = spawnSync('tar', ['-xzf', archivePath, '-C', configDir, ...restorableArchiveEntries], {
    stdio: 'inherit',
  })
  if (tarFailed(result.status)) {
    if (result.error) console.error(result.error.message)
    console.error('Restore failed.')
    process.exit(result.status ?? 1)
  }

  for (const file of restorableFiles) {
    const targetPath = join(configDir, file)
    if (existsSync(targetPath)) chmodSync(targetPath, 0o600)
  }

  console.log(`✔ Restored from ${archivePath}.`)
  console.log('Credentials restored:')
  if (credentialFiles.length === 0) {
    console.log('  none')
  } else {
    for (const file of credentialFiles) {
      console.log(`  ${file}`)
    }
  }

  console.log('Data restored:')
  if (dbFiles.length === 0) {
    console.log('  none')
  } else {
    for (const file of dbFiles) {
      console.log(`  ${file}`)
    }
  }

  console.log('Daemon restart required (howl-pa daemon restart or systemctl --user restart howl-pa).')
}

const args = parseArgs(process.argv.slice(2))
if (args.restore) restore(args.restore, args.force)
else backup(args.out, args.withData)

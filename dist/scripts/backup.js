import { chmodSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expandPath, resolveConfigDir } from '../src/env.js';
const CREDENTIAL_FILES = ['.env', 'google-token.json'];
function usage() {
    console.error('Usage: howl-pa backup [--out <path>] [--restore <path>] [--force]');
    process.exit(1);
}
function parseArgs(argv) {
    const parsed = { force: false };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (!arg)
            usage();
        if (arg === '--force') {
            parsed.force = true;
            continue;
        }
        if (arg === '--out' || arg === '--restore') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--'))
                usage();
            if (arg === '--out')
                parsed.out = value;
            else
                parsed.restore = value;
            index++;
            continue;
        }
        usage();
    }
    if (parsed.out && parsed.restore)
        usage();
    return parsed;
}
function dateStamp() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function defaultBackupPath() {
    return join(homedir(), `howl-pa-backup-${dateStamp()}.tgz`);
}
function absolutePath(path) {
    return resolve(expandPath(path) ?? path);
}
function existingCredentialFiles(configDir) {
    return CREDENTIAL_FILES.filter(file => existsSync(join(configDir, file)));
}
function tarFailed(status) {
    return status !== 0;
}
function backup(outArg) {
    const configDir = resolveConfigDir();
    const outPath = absolutePath(outArg ?? defaultBackupPath());
    const existingFiles = existingCredentialFiles(configDir);
    if (existingFiles.length === 0) {
        console.error(`No credentials found in ${configDir}; nothing to back up.`);
        process.exit(1);
    }
    const result = spawnSync('tar', ['-czf', outPath, '-C', configDir, ...existingFiles], {
        stdio: 'inherit',
    });
    if (tarFailed(result.status)) {
        if (result.error)
            console.error(result.error.message);
        console.error('Backup failed.');
        process.exit(result.status ?? 1);
    }
    chmodSync(outPath, 0o600);
    console.log('✔ Howl PA credentials backed up.');
    console.log(`Path: ${outPath}`);
    console.log(`Restore: howl-pa backup --restore ${outPath}`);
    console.log('');
    console.log('Included:');
    for (const file of existingFiles) {
        const size = statSync(join(configDir, file)).size;
        if (file === '.env') {
            console.log(`  .env              (${size} bytes)`);
        }
        else {
            console.log(`  google-token.json (${size} bytes)`);
        }
    }
}
function normalizeArchiveEntry(entry) {
    let normalized = entry.trim();
    while (normalized.startsWith('./'))
        normalized = normalized.slice(2);
    if (CREDENTIAL_FILES.includes(normalized)) {
        return normalized;
    }
    return null;
}
function listRestorableFiles(archivePath) {
    const result = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
    if (tarFailed(result.status)) {
        const detail = result.stderr.trim();
        if (detail)
            console.error(detail);
        console.error(`Unable to read backup archive: ${archivePath}`);
        process.exit(result.status ?? 1);
    }
    const included = new Set();
    for (const entry of result.stdout.split(/\r?\n/)) {
        const file = normalizeArchiveEntry(entry);
        if (file)
            included.add(file);
    }
    return CREDENTIAL_FILES.filter(file => included.has(file));
}
function restore(restoreArg, force) {
    const configDir = resolveConfigDir();
    const archivePath = absolutePath(restoreArg);
    if (!existsSync(archivePath)) {
        console.error(`Backup archive not found: ${archivePath}`);
        process.exit(1);
    }
    const restorableFiles = listRestorableFiles(archivePath);
    if (restorableFiles.length === 0) {
        console.error(`No restorable credentials found in ${archivePath}.`);
        process.exit(1);
    }
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    for (const file of restorableFiles) {
        const targetPath = join(configDir, file);
        if (existsSync(targetPath) && !force) {
            console.error(`Existing ${file} at ${targetPath}. Pass --force to overwrite (the current ${file} will be renamed to ${file}.bak-<ts> before writing).`);
            process.exit(1);
        }
    }
    for (const file of restorableFiles) {
        const targetPath = join(configDir, file);
        if (existsSync(targetPath)) {
            renameSync(targetPath, `${targetPath}.bak-${Date.now()}`);
        }
    }
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', configDir], {
        stdio: 'inherit',
    });
    if (tarFailed(result.status)) {
        if (result.error)
            console.error(result.error.message);
        console.error('Restore failed.');
        process.exit(result.status ?? 1);
    }
    for (const file of restorableFiles) {
        const targetPath = join(configDir, file);
        if (existsSync(targetPath))
            chmodSync(targetPath, 0o600);
    }
    console.log(`✔ Restored from ${archivePath}. Daemon restart required (howl-pa daemon restart or systemctl --user restart howl-pa).`);
}
const args = parseArgs(process.argv.slice(2));
if (args.restore)
    restore(args.restore, args.force);
else
    backup(args.out);
//# sourceMappingURL=backup.js.map
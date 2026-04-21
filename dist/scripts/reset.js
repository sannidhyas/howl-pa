import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolveConfigDir } from '../src/env.js';
const SERVICE_NAME = 'howl-pa.service';
const UNIT_FILE = join(homedir(), '.config', 'systemd', 'user', SERVICE_NAME);
function usage() {
    console.error('Usage: howl-pa reset [--yes] [--keep-backup]');
    process.exit(1);
}
function parseArgs(argv) {
    const parsed = { yes: false, keepBackup: false };
    for (const arg of argv) {
        if (arg === '--yes') {
            parsed.yes = true;
        }
        else if (arg === '--keep-backup') {
            parsed.keepBackup = true;
        }
        else {
            usage();
        }
    }
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
function question(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer);
        });
    });
}
async function confirmReset(yes) {
    if (!process.stdout.isTTY && !yes) {
        console.error('Reset requires a TTY. Pass --yes to run non-interactively.');
        process.exit(1);
    }
    if (yes)
        return;
    const answer = await question("This will DELETE .env, google-token.json, howl.db, and the systemd unit (if installed). Type 'yes' to continue: ");
    if (answer !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
    }
}
function runBackup() {
    const expectedBackupPath = defaultBackupPath();
    const backupScriptPath = fileURLToPath(new URL('./backup.js', import.meta.url));
    const result = spawnSync(process.execPath, [backupScriptPath], { stdio: 'inherit' });
    if (result.status !== 0) {
        if (result.error)
            console.error(result.error.message);
        console.error('Backup failed; reset aborted. Pass --keep-backup to reset without a backup.');
        process.exit(result.status ?? 1);
    }
    console.log('Backup complete.');
    return expectedBackupPath;
}
function stopDaemonIfActive() {
    const active = spawnSync('systemctl', ['--user', 'is-active', SERVICE_NAME], {
        encoding: 'utf8',
    });
    if (active.status === 0) {
        spawnSync('systemctl', ['--user', 'stop', SERVICE_NAME], { stdio: 'inherit' });
    }
}
function resetFiles(configDir) {
    rmSync(join(configDir, '.env'), { force: true });
    rmSync(join(configDir, 'google-token.json'), { force: true });
    rmSync(join(configDir, 'store'), { recursive: true, force: true });
}
function removeSystemdUnit() {
    if (!existsSync(UNIT_FILE))
        return;
    spawnSync('systemctl', ['--user', 'disable', SERVICE_NAME], { stdio: 'inherit' });
    rmSync(UNIT_FILE, { force: true });
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    await confirmReset(args.yes);
    const configDir = resolveConfigDir();
    const backupPath = args.keepBackup ? 'skipped (--keep-backup)' : runBackup();
    stopDaemonIfActive();
    resetFiles(configDir);
    removeSystemdUnit();
    console.log('✔ Howl PA reset.');
    console.log(`Backup: ${backupPath}`);
    console.log(`Config dir: ${configDir} (empty, ready for setup)`);
    console.log('Next: howl-pa setup');
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=reset.js.map
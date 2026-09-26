import { app, BrowserWindow, dialog } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { writeDesktopLog } from './desktop-logger';
import { configuredRuntimeMode, startStandaloneRuntime, stopStandaloneRuntime } from './standalone-runtime';

const BACKUP_FORMAT = 'mizan-standalone-backup';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024 * 1024;

export interface DataOperationResult {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  error?: 'UNAUTHORIZED' | 'STANDALONE_ONLY' | 'BACKUP_FAILED' | 'INVALID_BACKUP' | 'RESTORE_FAILED';
}

function userDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments);
}

function safeName(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function createBackupArchive(
  destination: string,
  kind: 'automatic' | 'manual' | 'pre-upgrade',
): Promise<void> {
  const database = userDataPath('database');
  const secrets = userDataPath('runtime', 'runtime-secrets.json');
  if (!fs.existsSync(path.join(database, 'PG_VERSION')) || !fs.existsSync(secrets)) {
    throw new Error('No initialized local database is available to back up');
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-backup-'));
  try {
    fs.cpSync(database, path.join(staging, 'database'), { recursive: true, errorOnExist: true });
    fs.rmSync(path.join(staging, 'database', 'postmaster.pid'), { force: true });
    fs.mkdirSync(path.join(staging, 'runtime'), { recursive: true, mode: 0o700 });
    fs.copyFileSync(secrets, path.join(staging, 'runtime', 'runtime-secrets.json'));
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      postgresMajor: 16,
      platform: process.platform,
      arch: process.arch,
      createdAt: new Date().toISOString(),
      kind,
    }), { mode: 0o600 });
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await tar.create({ cwd: staging, file: temporary, gzip: true, portable: false }, [
      'manifest.json', 'database', 'runtime/runtime-secrets.json',
    ]);
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export async function createAutomaticBackupIfDue(): Promise<void> {
  if (configuredRuntimeMode() !== 'standalone') return;
  if (!fs.existsSync(userDataPath('database', 'PG_VERSION'))) return;
  const directory = userDataPath('backups');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const existing = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.mizan-backup'))
    .map((name) => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (existing[0] && Date.now() - existing[0].time < 24 * 60 * 60 * 1000) return;

  const destination = path.join(directory, `Mizan-Auto-${safeName()}.mizan-backup`);
  await createBackupArchive(destination, 'automatic');
  for (const expired of existing.slice(6)) fs.rmSync(path.join(directory, expired.name), { force: true });
  writeDesktopLog('info', 'automatic_backup_completed', { fileName: path.basename(destination) });
}

export async function createPreUpgradeBackup(): Promise<string | null> {
  if (configuredRuntimeMode() !== 'standalone') return null;
  if (!fs.existsSync(userDataPath('database', 'PG_VERSION'))) return null;

  const directory = userDataPath('backups', 'pre-upgrade');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `Mizan-Pre-Upgrade-${safeName()}.mizan-backup`);
  await createBackupArchive(destination, 'pre-upgrade');

  const existing = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.mizan-backup'))
    .map((name) => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const expired of existing.slice(3)) fs.rmSync(path.join(directory, expired.name), { force: true });
  writeDesktopLog('info', 'pre_upgrade_backup_completed', { fileName: path.basename(destination) });
  return destination;
}

export async function createManualBackup(window: BrowserWindow): Promise<DataOperationResult> {
  if (configuredRuntimeMode() !== 'standalone') return { ok: false, error: 'STANDALONE_ONLY' };
  const selected = await dialog.showSaveDialog(window, {
    title: 'Save Mizan backup | حفظ نسخة ميزان الاحتياطية',
    defaultPath: path.join(app.getPath('documents'), `Mizan-Backup-${safeName()}.mizan-backup`),
    filters: [{ name: 'Mizan Backup', extensions: ['mizan-backup'] }],
  });
  if (selected.canceled || !selected.filePath) return { ok: false, cancelled: true };

  return createBackupAtPath(selected.filePath);
}

export async function createBackupAtPath(destination: string): Promise<DataOperationResult> {
  if (configuredRuntimeMode() !== 'standalone') return { ok: false, error: 'STANDALONE_ONLY' };
  await stopStandaloneRuntime();
  try {
    await createBackupArchive(destination, 'manual');
    writeDesktopLog('info', 'manual_backup_completed', { fileName: path.basename(destination) });
    return { ok: true, fileName: path.basename(destination) };
  } catch (error) {
    writeDesktopLog('error', 'manual_backup_failed', error);
    return { ok: false, error: 'BACKUP_FAILED' };
  } finally {
    await startStandaloneRuntime();
  }
}

function validateExtractedBackup(directory: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as {
    format?: string; version?: number; postgresMajor?: number; platform?: string; arch?: string;
  };
  if (
    manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION ||
    manifest.postgresMajor !== 16 || manifest.platform !== process.platform || manifest.arch !== process.arch
  ) throw new Error('Backup format or platform is incompatible');
  if (fs.readFileSync(path.join(directory, 'database', 'PG_VERSION'), 'utf8').trim() !== '16') {
    throw new Error('Backup PostgreSQL version is incompatible');
  }
  const secrets = JSON.parse(fs.readFileSync(
    path.join(directory, 'runtime', 'runtime-secrets.json'), 'utf8',
  )) as { databasePassword?: string; jwtSecret?: string };
  if ((secrets.databasePassword?.length ?? 0) < 32 || (secrets.jwtSecret?.length ?? 0) < 32) {
    throw new Error('Backup secrets are invalid');
  }
}

export async function restoreBackup(window: BrowserWindow): Promise<DataOperationResult> {
  if (configuredRuntimeMode() !== 'standalone') return { ok: false, error: 'STANDALONE_ONLY' };
  const selected = await dialog.showOpenDialog(window, {
    title: 'Restore Mizan backup | استعادة نسخة ميزان الاحتياطية',
    properties: ['openFile'],
    filters: [{ name: 'Mizan Backup', extensions: ['mizan-backup'] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return { ok: false, cancelled: true };
  const source = selected.filePaths[0];
  const confirmation = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Restore backup | استعادة النسخة',
    message: 'Replace the current Mizan data? | هل تريد استبدال بيانات ميزان الحالية؟',
    detail: 'Mizan preserves a safety copy and restarts after restoration.\nسيحتفظ ميزان بنسخة أمان ثم يعيد التشغيل بعد الاستعادة.',
    buttons: ['Cancel | إلغاء', 'Restore | استعادة'],
    defaultId: 0,
    cancelId: 0,
  });
  if (confirmation.response !== 1) return { ok: false, cancelled: true };

  return restoreBackupFromPath(source);
}

export async function restoreBackupFromPath(source: string): Promise<DataOperationResult> {
  if (configuredRuntimeMode() !== 'standalone') return { ok: false, error: 'STANDALONE_ONLY' };
  try {
    if (fs.statSync(source).size > MAX_BACKUP_BYTES) return { ok: false, error: 'INVALID_BACKUP' };
  } catch {
    return { ok: false, error: 'INVALID_BACKUP' };
  }
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-restore-'));
  const rollback = userDataPath('restore-safety');
  const database = userDataPath('database');
  const secrets = userDataPath('runtime', 'runtime-secrets.json');
  await stopStandaloneRuntime();
  try {
    await tar.extract({
      cwd: extracted,
      file: source,
      strict: true,
      preservePaths: false,
      filter: (entryPath, entry) => {
        const normalized = entryPath.replace(/^\.\//, '');
        const allowedPath = normalized === 'manifest.json' || normalized === 'database' ||
          normalized.startsWith('database/') || normalized === 'runtime' ||
          normalized === 'runtime/runtime-secrets.json';
        return allowedPath && 'type' in entry && (entry.type === 'File' || entry.type === 'Directory');
      },
    });
    validateExtractedBackup(extracted);
    fs.rmSync(rollback, { recursive: true, force: true });
    fs.mkdirSync(path.join(rollback, 'runtime'), { recursive: true, mode: 0o700 });
    if (fs.existsSync(database)) fs.renameSync(database, path.join(rollback, 'database'));
    if (fs.existsSync(secrets)) fs.renameSync(secrets, path.join(rollback, 'runtime', 'runtime-secrets.json'));
    fs.renameSync(path.join(extracted, 'database'), database);
    fs.renameSync(path.join(extracted, 'runtime', 'runtime-secrets.json'), secrets);
    fs.chmodSync(database, 0o700);
    fs.chmodSync(secrets, 0o600);
    const runtime = await startStandaloneRuntime();
    if (runtime.state !== 'ready') throw new Error('Restored runtime did not become ready');
    writeDesktopLog('info', 'backup_restore_completed', { fileName: path.basename(source) });
    return { ok: true, fileName: path.basename(source) };
  } catch (error) {
    writeDesktopLog('error', 'backup_restore_failed', error);
    await stopStandaloneRuntime();
    if (fs.existsSync(path.join(rollback, 'database'))) {
      fs.rmSync(database, { recursive: true, force: true });
      fs.renameSync(path.join(rollback, 'database'), database);
    }
    if (fs.existsSync(path.join(rollback, 'runtime', 'runtime-secrets.json'))) {
      fs.rmSync(secrets, { force: true });
      fs.renameSync(path.join(rollback, 'runtime', 'runtime-secrets.json'), secrets);
    }
    await startStandaloneRuntime();
    return { ok: false, error: 'RESTORE_FAILED' };
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}

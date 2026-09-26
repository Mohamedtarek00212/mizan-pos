import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function logFilePath(): string {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|secret)(["'=:\s]+)[^\s,"'}]+/gi, '$1$2[REDACTED]')
    .slice(0, 4_000);
}

function rotateIfNeeded(destination: string): void {
  try {
    if (fs.statSync(destination).size >= MAX_LOG_BYTES) {
      const backup = `${destination}.1`;
      try {
        fs.unlinkSync(backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      fs.renameSync(destination, backup);
    }
  } catch {
    // No existing log is the normal first-run state.
  }
}

export function writeDesktopLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  details?: unknown,
): void {
  try {
    const destination = logFilePath();
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    rotateIfNeeded(destination);
    const safeDetails = details instanceof Error
      ? { name: details.name, message: redact(details.message) }
      : typeof details === 'string'
        ? redact(details)
        : details;
    fs.appendFileSync(destination, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(safeDetails === undefined ? {} : { details: safeDetails }),
    })}\n`, { mode: 0o600 });
  } catch {
    // Logging failure must never interrupt checkout operations.
  }
}

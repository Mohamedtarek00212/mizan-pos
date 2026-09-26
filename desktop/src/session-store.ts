import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { DesktopSessionState } from './contracts';

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'session.bin');
}

export function readEncryptedSession(): DesktopSessionState {
  const secureStorageAvailable = safeStorage.isEncryptionAvailable();
  if (!secureStorageAvailable) return { token: null, secureStorageAvailable };

  try {
    const encryptedToken = fs.readFileSync(sessionFilePath());
    return {
      token: safeStorage.decryptString(encryptedToken),
      secureStorageAvailable,
    };
  } catch {
    return { token: null, secureStorageAvailable };
  }
}

export function writeEncryptedSession(token: string): boolean {
  if (!safeStorage.isEncryptionAvailable() || token.length < 16 || token.length > 16_384) {
    return false;
  }

  const destination = sessionFilePath();
  const temporary = `${destination}.tmp`;
  const encryptedToken = safeStorage.encryptString(token);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, encryptedToken, { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return true;
}

export function clearEncryptedSession(): void {
  try {
    fs.unlinkSync(sessionFilePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

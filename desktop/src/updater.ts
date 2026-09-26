import { app, dialog, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';

import { writeDesktopLog } from './desktop-logger';

type WindowProvider = () => BrowserWindow | null;
type BeforeUpdateInstall = () => Promise<void>;

let updateConfigured = false;
let updateCheckRunning = false;
let manualCheckAwaitingResult = false;

function validUpdateUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

export function initializeUpdater(
  getMainWindow: WindowProvider,
  beforeUpdateInstall: BeforeUpdateInstall,
): void {
  if (!app.isPackaged) return;

  const runtimeUrl = process.env.MIZAN_UPDATE_URL?.trim();
  if (runtimeUrl) {
    const updateUrl = validUpdateUrl(runtimeUrl);
    if (!updateUrl) {
      writeDesktopLog('error', 'update_configuration_rejected', { reason: 'HTTPS_REQUIRED' });
      return;
    }
    autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
  } else if (!existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    writeDesktopLog('info', 'updates_disabled', { reason: 'NO_SIGNED_RELEASE_FEED' });
    return;
  }

  updateConfigured = true;
  autoUpdater.autoDownload = false;
  // Installation only starts through the controlled path below. That path
  // shuts down PostgreSQL and creates a recoverable pre-upgrade backup first.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (message?: unknown) => writeDesktopLog('info', 'updater', String(message ?? '')),
    warn: (message?: unknown) => writeDesktopLog('warn', 'updater', String(message ?? '')),
    error: (message?: unknown) => writeDesktopLog('error', 'updater', String(message ?? '')),
    debug: (message?: unknown) => writeDesktopLog('info', 'updater_debug', String(message ?? '')),
  };

  autoUpdater.on('update-available', (info) => {
    manualCheckAwaitingResult = false;
    writeDesktopLog('info', 'update_available', { version: info.version });
    const window = getMainWindow();
    if (!window) return;
    void dialog.showMessageBox(window, {
      type: 'info',
      title: 'Mizan POS Update | تحديث ميزان',
      message: `Mizan POS ${info.version} is available. | يتوفر تحديث ميزان ${info.version}.`,
      detail: 'Download the verified update now? | هل تريد تنزيل التحديث الموثق الآن؟',
      buttons: ['Download | تنزيل', 'Later | لاحقًا'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) void autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    if (!manualCheckAwaitingResult) return;
    manualCheckAwaitingResult = false;
    const window = getMainWindow();
    if (!window) return;
    void dialog.showMessageBox(window, {
      type: 'info',
      title: 'Mizan POS | ميزان',
      message: 'Mizan POS is up to date. | ميزان مُحدّث إلى آخر إصدار.',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    writeDesktopLog('info', 'update_downloaded', { version: info.version });
    const window = getMainWindow();
    if (!window) return;
    void dialog.showMessageBox(window, {
      type: 'info',
      title: 'Update ready | التحديث جاهز',
      message: 'The verified update is ready to install. | التحديث الموثق جاهز للتثبيت.',
      buttons: ['Restart and install | إعادة التشغيل والتثبيت', 'Later | لاحقًا'],
      defaultId: 0,
      cancelId: 1,
    }).then(async ({ response }) => {
      if (response !== 0) return;
      try {
        await beforeUpdateInstall();
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        writeDesktopLog('error', 'update_install_preparation_failed', error);
        const activeWindow = getMainWindow();
        if (!activeWindow) return;
        await dialog.showMessageBox(activeWindow, {
          type: 'warning',
          title: 'Update postponed | تم تأجيل التحديث',
          message: 'Mizan could not create the safety backup. | تعذر على ميزان إنشاء نسخة الأمان.',
          detail: 'Your current version and data were left unchanged. Try again after checking free disk space.\nلم تتغير نسختك الحالية أو بياناتك. حاول مجددًا بعد التحقق من مساحة القرص.',
        });
      }
    });
  });

  autoUpdater.on('error', (error) => {
    manualCheckAwaitingResult = false;
    writeDesktopLog('error', 'update_failed', error);
  });

  setTimeout(() => void checkForUpdates(false, getMainWindow), 30_000);
  setInterval(() => void checkForUpdates(false, getMainWindow), 6 * 60 * 60 * 1_000).unref();
}

export async function checkForUpdates(manual: boolean, getMainWindow: WindowProvider): Promise<void> {
  const window = getMainWindow();
  if (!updateConfigured) {
    if (manual && window) {
      await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Updates unavailable | التحديثات غير متاحة',
        message: 'This development build has no signed update channel. | نسخة التطوير لا تحتوي على قناة تحديث موقعة.',
      });
    }
    return;
  }
  if (updateCheckRunning) return;

  updateCheckRunning = true;
  manualCheckAwaitingResult = manual;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    manualCheckAwaitingResult = false;
    writeDesktopLog('error', 'update_check_failed', error);
    if (manual && window) {
      await dialog.showMessageBox(window, {
        type: 'warning',
        title: 'Update check failed | تعذر فحص التحديث',
        message: 'Check the network and try again. | تحقق من الشبكة وحاول مرة أخرى.',
      });
    }
  } finally {
    updateCheckRunning = false;
  }
}

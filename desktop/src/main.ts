import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DESKTOP_CHANNELS, type DesktopAppInfo } from './contracts';
import { installApplicationMenu } from './app-menu';
import { writeDesktopLog } from './desktop-logger';
import {
  readServerConfig,
  testAndSaveServerConfig,
  testServerConnection,
} from './server-config';
import { persistWindowState, readWindowState } from './window-state';
import { clearEncryptedSession, readEncryptedSession, writeEncryptedSession } from './session-store';
import { pulseCashDrawer } from './cash-drawer';
import { checkForUpdates, initializeUpdater } from './updater';
import {
  simulatePreviousSchemaForTest,
  startStandaloneRuntime,
  stopStandaloneRuntime,
} from './standalone-runtime';
import {
  createAutomaticBackupIfDue,
  createBackupAtPath,
  createManualBackup,
  createPreUpgradeBackup,
  restoreBackup,
  restoreBackupFromPath,
} from './data-management';

const DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);
protocol.registerSchemesAsPrivileged([{
  scheme: 'mizan',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

const productionRendererPath = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer')
  : path.resolve(__dirname, '../../frontend/dist');
const desktopAssetsPath = path.resolve(__dirname, '../assets');
const applicationIconPath = path.join(desktopAssetsPath, 'icon.png');
const MINIMUM_SPLASH_DURATION_MS = 900;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;
let rendererRecoveryAttempts = 0;
let runtimeShutdownStarted = false;
let runtimeShutdownComplete = false;

async function prepareForUpdateInstall(): Promise<void> {
  if (runtimeShutdownStarted) throw new Error('Runtime shutdown is already in progress');
  runtimeShutdownStarted = true;
  try {
    await stopStandaloneRuntime();
    await createPreUpgradeBackup();
    runtimeShutdownComplete = true;
  } catch (error) {
    runtimeShutdownStarted = false;
    runtimeShutdownComplete = false;
    await startStandaloneRuntime().catch((restartError) => {
      writeDesktopLog('error', 'runtime_restart_after_update_failure_failed', restartError);
    });
    throw error;
  }
}

async function verifyFreshStandaloneSetup(apiBaseUrl: string): Promise<void> {
  const initial = await fetch(`${apiBaseUrl}/setup/status`);
  const initialStatus = await initial.json() as { initialized?: boolean };
  if (!initial.ok) throw new Error('Standalone setup status request failed');
  if (initialStatus.initialized === false) {
    const initialization = await fetch(`${apiBaseUrl}/setup/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: 'Mizan Acceptance Store',
        admin_full_name: 'Acceptance Administrator',
        admin_username: 'acceptance-admin',
        admin_password: 'Acceptance123',
        register_name: 'Main register',
        register_code: 'REG-1',
        tax_rate_pct: 14,
      }),
    });
    if (initialization.status !== 201) throw new Error('First-run initialization request failed');
  }
  const login = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'acceptance-admin', password: 'Acceptance123' }),
  });
  if (!login.ok) throw new Error('First-run administrator could not sign in');
}

app.setName('Mizan POS');
if (
  process.env.MIZAN_USER_DATA_DIR &&
  (!app.isPackaged || process.env.MIZAN_STANDALONE_SELF_TEST === '1')
) {
  app.setPath('userData', path.resolve(process.env.MIZAN_USER_DATA_DIR));
}

async function createSplashWindow(): Promise<void> {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 330,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#09271f',
    icon: applicationIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  splashWindow.once('ready-to-show', () => {
    splashShownAt = Date.now();
    splashWindow?.show();
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  await splashWindow.loadFile(path.join(desktopAssetsPath, 'splash.html'));
}

function revealMainWindow(): void {
  const remainingSplashTime = Math.max(
    0,
    MINIMUM_SPLASH_DURATION_MS - (Date.now() - splashShownAt),
  );
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    mainWindow?.show();
    mainWindow?.focus();
  }, remainingSplashTime);
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === 'mizan:') return url.hostname === 'app';

    return DEVELOPMENT_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

function registerProductionRendererProtocol(): void {
  protocol.handle('mizan', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 });

      const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const requestedFile = relativePath && path.extname(relativePath) ? relativePath : 'index.html';
      const resolvedFile = path.resolve(productionRendererPath, requestedFile);
      const rendererRoot = `${path.resolve(productionRendererPath)}${path.sep}`;
      if (!resolvedFile.startsWith(rendererRoot)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(resolvedFile).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function secureWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (!isTrustedRendererUrl(url) && isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      writeDesktopLog('error', 'renderer_load_failed', {
        errorCode,
        errorDescription,
        urlOrigin: safeUrlOrigin(validatedUrl),
      });
    }
  });
}

function safeUrlOrigin(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return 'invalid-url';
  }
}

function installRendererRecovery(window: BrowserWindow): void {
  window.webContents.on('render-process-gone', (_event, details) => {
    writeDesktopLog('error', 'renderer_process_gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
    if (details.reason === 'clean-exit' || window.isDestroyed()) return;

    rendererRecoveryAttempts += 1;
    if (rendererRecoveryAttempts <= 2) {
      setTimeout(() => {
        if (!window.isDestroyed()) window.reload();
      }, 400);
      return;
    }

    void dialog.showMessageBox(window, {
      type: 'error',
      title: 'Mizan POS | ميزان',
      message: 'The application interface stopped unexpectedly. | توقفت واجهة التطبيق بشكل غير متوقع.',
      detail: 'Restart Mizan POS to continue safely. | أعد تشغيل ميزان للمتابعة بأمان.',
      buttons: ['Restart | إعادة التشغيل', 'Quit | إنهاء'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) app.relaunch();
      app.quit();
    });
  });

  window.on('unresponsive', () => {
    writeDesktopLog('warn', 'main_window_unresponsive');
  });
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

async function createMainWindow(): Promise<void> {
  const windowState = readWindowState();
  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    backgroundColor: '#edf6f2',
    title: 'Mizan POS | ميزان',
    icon: applicationIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  secureWebContents(mainWindow.webContents);
  installRendererRecovery(mainWindow);
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }
  mainWindow.once('ready-to-show', revealMainWindow);
  mainWindow.on('close', () => {
    if (mainWindow) {
      persistWindowState(mainWindow);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    const origin = new URL(developmentUrl).origin;
    if (!DEVELOPMENT_ORIGINS.has(origin)) {
      throw new Error(`Untrusted ELECTRON_RENDERER_URL origin: ${origin}`);
    }
    await mainWindow.loadURL(developmentUrl);
    return;
  }

  await mainWindow.loadURL('mizan://app/');
}

function trustedWindowForEvent(event: IpcMainInvokeEvent): BrowserWindow {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Blocked IPC request from an untrusted renderer.');
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error('The IPC sender is not attached to an application window.');
  }

  return window;
}

function registerDesktopIpc(): void {
  const hasActiveAdminSession = async (): Promise<boolean> => {
    const token = readEncryptedSession().token;
    const apiBaseUrl = readServerConfig().apiBaseUrl;
    if (!token || !apiBaseUrl) return false;
    try {
      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return false;
      const user = await response.json() as { role?: string };
      return user.role === 'ADMIN';
    } catch {
      return false;
    }
  };
  ipcMain.handle(DESKTOP_CHANNELS.getAppInfo, (event): DesktopAppInfo => {
    trustedWindowForEvent(event);

    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
    };
  });

  ipcMain.handle(DESKTOP_CHANNELS.minimizeWindow, (event): void => {
    trustedWindowForEvent(event).minimize();
  });

  ipcMain.handle(DESKTOP_CHANNELS.toggleMaximizeWindow, (event): boolean => {
    const window = trustedWindowForEvent(event);
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });

  ipcMain.handle(DESKTOP_CHANNELS.closeWindow, (event): void => {
    trustedWindowForEvent(event).close();
  });

  ipcMain.handle(DESKTOP_CHANNELS.getServerConfig, (event) => {
    trustedWindowForEvent(event);
    return readServerConfig();
  });

  ipcMain.handle(DESKTOP_CHANNELS.testServerConnection, (event, apiBaseUrl: unknown) => {
    trustedWindowForEvent(event);
    if (typeof apiBaseUrl !== 'string') {
      return { ok: false, apiBaseUrl: null, errorCode: 'INVALID_URL' as const };
    }
    return testServerConnection(apiBaseUrl);
  });

  ipcMain.handle(DESKTOP_CHANNELS.saveServerConfig, (event, apiBaseUrl: unknown) => {
    trustedWindowForEvent(event);
    if (typeof apiBaseUrl !== 'string') {
      return { ok: false, apiBaseUrl: null, errorCode: 'INVALID_URL' as const };
    }
    return testAndSaveServerConfig(apiBaseUrl);
  });

  ipcMain.handle(DESKTOP_CHANNELS.restartLocalRuntime, async (event) => {
    trustedWindowForEvent(event);
    await stopStandaloneRuntime();
    await startStandaloneRuntime();
    return readServerConfig();
  });

  ipcMain.handle(DESKTOP_CHANNELS.createBackup, async (event) => {
    const window = trustedWindowForEvent(event);
    if (!(await hasActiveAdminSession())) return { ok: false, error: 'UNAUTHORIZED' as const };
    return createManualBackup(window);
  });

  ipcMain.handle(DESKTOP_CHANNELS.restoreBackup, async (event) => {
    const window = trustedWindowForEvent(event);
    if (!(await hasActiveAdminSession())) return { ok: false, error: 'UNAUTHORIZED' as const };
    return restoreBackup(window);
  });

  ipcMain.handle(DESKTOP_CHANNELS.readSession, (event) => {
    trustedWindowForEvent(event);
    return readEncryptedSession();
  });

  ipcMain.handle(DESKTOP_CHANNELS.writeSession, (event, token: unknown): boolean => {
    trustedWindowForEvent(event);
    return typeof token === 'string' && writeEncryptedSession(token);
  });

  ipcMain.handle(DESKTOP_CHANNELS.clearSession, (event): void => {
    trustedWindowForEvent(event);
    clearEncryptedSession();
  });

  ipcMain.handle(DESKTOP_CHANNELS.reportRendererError, (event, message: unknown): void => {
    trustedWindowForEvent(event);
    if (typeof message === 'string') {
      writeDesktopLog('error', 'renderer_error_boundary', message.slice(0, 2_000));
    }
  });

  ipcMain.handle(DESKTOP_CHANNELS.printReceipt, async (event, receiptNumber: unknown) => {
    const window = trustedWindowForEvent(event);
    if (typeof receiptNumber !== 'number' || !Number.isSafeInteger(receiptNumber) || receiptNumber <= 0) {
      return { ok: false, error: 'INVALID_RECEIPT' as const };
    }

    writeDesktopLog('info', 'receipt_print_requested', { receiptNumber });
    return new Promise<{ ok: boolean; error?: 'PRINT_FAILED' | 'PRINT_CANCELLED' }>((resolve) => {
      window.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: 'none' },
        },
        (success, failureReason) => {
          if (success) {
            writeDesktopLog('info', 'receipt_print_completed', { receiptNumber });
            resolve({ ok: true });
            return;
          }

          const cancelled = /cancel/i.test(failureReason);
          writeDesktopLog(cancelled ? 'info' : 'error', 'receipt_print_failed', {
            receiptNumber,
            reason: failureReason.slice(0, 300),
          });
          resolve({ ok: false, error: cancelled ? 'PRINT_CANCELLED' : 'PRINT_FAILED' });
        },
      );
    });
  });

  ipcMain.handle(DESKTOP_CHANNELS.openCashDrawer, async (event, saleId: unknown) => {
    trustedWindowForEvent(event);
    if (typeof saleId !== 'number' || !Number.isSafeInteger(saleId) || saleId <= 0) {
      return { ok: false, error: 'INVALID_REQUEST' as const };
    }

    writeDesktopLog('info', 'cash_drawer_open_requested', { saleId, trigger: 'CASH_PAYMENT' });
    const result = await pulseCashDrawer();
    writeDesktopLog(result.ok ? 'info' : 'warn', 'cash_drawer_open_result', {
      saleId,
      ok: result.ok,
      error: result.error,
    });
    return result;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    app.setAppUserModelId('com.mizan.pos');
    app.setAboutPanelOptions({
      applicationName: 'Mizan POS | ميزان',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: `Copyright © ${new Date().getFullYear()} Mizan POS`,
      credits: 'Smart retail management | إدارة التجزئة بذكاء',
    });
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(applicationIconPath);
    }
    process.on('uncaughtException', (error) => {
      writeDesktopLog('error', 'uncaught_exception', error);
    });
    process.on('unhandledRejection', (reason) => {
      writeDesktopLog('error', 'unhandled_rejection', reason instanceof Error ? reason : String(reason));
    });
    writeDesktopLog('info', 'application_started', {
      version: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged,
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerProductionRendererProtocol();

    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault());
    });

    registerDesktopIpc();
    const getMainWindow = () => mainWindow;
    installApplicationMenu(getMainWindow, () => void checkForUpdates(true, getMainWindow));
    await createSplashWindow();
    await createAutomaticBackupIfDue().catch((error) => {
      writeDesktopLog('error', 'automatic_backup_failed', error);
    });
    const runtimeStatus = await startStandaloneRuntime();
    if (process.env.MIZAN_STANDALONE_SELF_TEST === '1') {
      if (runtimeStatus.state !== 'ready' || !runtimeStatus.apiBaseUrl) {
        throw new Error(`Standalone self-test failed: ${runtimeStatus.errorCode ?? runtimeStatus.state}`);
      }
      await verifyFreshStandaloneSetup(runtimeStatus.apiBaseUrl);
      const acceptanceBackup = path.join(app.getPath('userData'), 'acceptance.mizan-backup');
      const backupResult = await createBackupAtPath(acceptanceBackup);
      if (!backupResult.ok) throw new Error(`Standalone backup failed: ${backupResult.error}`);
      const restoreResult = await restoreBackupFromPath(acceptanceBackup);
      if (!restoreResult.ok) throw new Error(`Standalone restore failed: ${restoreResult.error}`);
      const restoredApi = readServerConfig().apiBaseUrl;
      if (!restoredApi) throw new Error('Restored standalone API is unavailable');
      await verifyFreshStandaloneSetup(restoredApi);
      await stopStandaloneRuntime();
      const preUpgradeBackup = await createPreUpgradeBackup();
      if (!preUpgradeBackup) throw new Error('Pre-upgrade safety backup was not created');
      const restartedRuntime = await startStandaloneRuntime();
      if (restartedRuntime.state !== 'ready' || !restartedRuntime.apiBaseUrl) {
        throw new Error('Standalone runtime did not recover after pre-upgrade backup');
      }
      await verifyFreshStandaloneSetup(restartedRuntime.apiBaseUrl);
      if (process.env.MIZAN_SIMULATE_PREVIOUS_SCHEMA === '1') {
        await simulatePreviousSchemaForTest();
      }
      console.log(`MIZAN_STANDALONE_READY ${runtimeStatus.apiBaseUrl}`);
      await stopStandaloneRuntime();
      runtimeShutdownComplete = true;
      app.quit();
      return;
    }
    await createMainWindow();
    initializeUpdater(getMainWindow, prepareForUpdateInstall);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  }).catch((error: unknown) => {
    console.error('Mizan POS could not start.', error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  writeDesktopLog('info', 'application_stopping');
  if (runtimeShutdownComplete) return;
  event.preventDefault();
  if (runtimeShutdownStarted) return;
  runtimeShutdownStarted = true;
  void stopStandaloneRuntime().finally(() => {
    runtimeShutdownComplete = true;
    app.quit();
  });
});

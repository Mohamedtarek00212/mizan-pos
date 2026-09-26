import { contextBridge, ipcRenderer } from 'electron';

// Keep the sandboxed preload self-contained. Electron's sandbox exposes a
// limited `require`, so importing local runtime modules here would prevent the
// bridge from loading. These names mirror the typed main-process contracts.
const DESKTOP_CHANNELS = {
  getAppInfo: 'desktop:get-app-info',
  minimizeWindow: 'desktop:window:minimize',
  toggleMaximizeWindow: 'desktop:window:toggle-maximize',
  closeWindow: 'desktop:window:close',
  getServerConfig: 'desktop:server:get-config',
  testServerConnection: 'desktop:server:test-connection',
  saveServerConfig: 'desktop:server:save-config',
  restartLocalRuntime: 'desktop:server:restart-local-runtime',
  navigate: 'desktop:navigate',
  readSession: 'desktop:session:read',
  writeSession: 'desktop:session:write',
  clearSession: 'desktop:session:clear',
  reportRendererError: 'desktop:report-renderer-error',
  printReceipt: 'desktop:receipt:print',
  openCashDrawer: 'desktop:cash-drawer:open',
  createBackup: 'desktop:data:create-backup',
  restoreBackup: 'desktop:data:restore-backup',
} as const;

interface DesktopAppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
}

interface DesktopServerConfig {
  apiBaseUrl: string | null;
  runtimeMode: 'standalone' | 'external';
  runtimeState: 'stopped' | 'starting' | 'ready' | 'failed';
  runtimeErrorCode?: 'DATABASE_START_FAILED' | 'BACKEND_START_FAILED' | 'RUNTIME_UNAVAILABLE';
}

interface ServerConnectionResult {
  ok: boolean;
  apiBaseUrl: string | null;
  status?: number;
  errorCode?: 'INVALID_URL' | 'INSECURE_URL' | 'UNREACHABLE' | 'UNHEALTHY' | 'INVALID_RESPONSE';
}

interface DesktopSessionState {
  token: string | null;
  secureStorageAvailable: boolean;
}

interface ReceiptPrintResult {
  ok: boolean;
  error?: 'INVALID_RECEIPT' | 'PRINT_FAILED' | 'PRINT_CANCELLED';
}

interface CashDrawerResult {
  ok: boolean;
  error?: 'INVALID_REQUEST' | 'NOT_CONFIGURED' | 'CONNECTION_FAILED' | 'TIMEOUT';
}

interface DataOperationResult {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  error?: 'UNAUTHORIZED' | 'STANDALONE_ONLY' | 'BACKUP_FAILED' | 'INVALID_BACKUP' | 'RESTORE_FAILED';
}

interface MizanDesktopApi {
  getAppInfo: () => Promise<DesktopAppInfo>;
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
  };
  server: {
    getConfig: () => Promise<DesktopServerConfig>;
    testConnection: (apiBaseUrl: string) => Promise<ServerConnectionResult>;
    saveConfig: (apiBaseUrl: string) => Promise<ServerConnectionResult>;
    restartLocal: () => Promise<DesktopServerConfig>;
  };
  onNavigate: (callback: (path: string) => void) => () => void;
  session: {
    read: () => Promise<DesktopSessionState>;
    write: (token: string) => Promise<boolean>;
    clear: () => Promise<void>;
  };
  reportError: (message: string) => Promise<void>;
  printReceipt: (receiptNumber: number) => Promise<ReceiptPrintResult>;
  openCashDrawer: (saleId: number) => Promise<CashDrawerResult>;
  data: {
    createBackup: () => Promise<DataOperationResult>;
    restoreBackup: () => Promise<DataOperationResult>;
  };
}

const desktopApi: MizanDesktopApi = Object.freeze({
  getAppInfo: () =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.getAppInfo) as Promise<DesktopAppInfo>,
  window: Object.freeze({
    minimize: () => ipcRenderer.invoke(DESKTOP_CHANNELS.minimizeWindow) as Promise<void>,
    toggleMaximize: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.toggleMaximizeWindow) as Promise<boolean>,
    close: () => ipcRenderer.invoke(DESKTOP_CHANNELS.closeWindow) as Promise<void>,
  }),
  server: Object.freeze({
    getConfig: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.getServerConfig) as Promise<DesktopServerConfig>,
    testConnection: (apiBaseUrl: string) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.testServerConnection,
        apiBaseUrl,
      ) as Promise<ServerConnectionResult>,
    saveConfig: (apiBaseUrl: string) =>
      ipcRenderer.invoke(
        DESKTOP_CHANNELS.saveServerConfig,
        apiBaseUrl,
      ) as Promise<ServerConnectionResult>,
    restartLocal: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.restartLocalRuntime) as Promise<DesktopServerConfig>,
  }),
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: unknown) => {
      if (typeof path === 'string' && path.startsWith('/')) callback(path);
    };
    ipcRenderer.on(DESKTOP_CHANNELS.navigate, listener);
    return () => ipcRenderer.removeListener(DESKTOP_CHANNELS.navigate, listener);
  },
  session: Object.freeze({
    read: () => ipcRenderer.invoke(DESKTOP_CHANNELS.readSession) as Promise<DesktopSessionState>,
    write: (token: string) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.writeSession, token) as Promise<boolean>,
    clear: () => ipcRenderer.invoke(DESKTOP_CHANNELS.clearSession) as Promise<void>,
  }),
  reportError: (message: string) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.reportRendererError, message) as Promise<void>,
  printReceipt: (receiptNumber: number) =>
    ipcRenderer.invoke(
      DESKTOP_CHANNELS.printReceipt,
      receiptNumber,
    ) as Promise<ReceiptPrintResult>,
  openCashDrawer: (saleId: number) =>
    ipcRenderer.invoke(DESKTOP_CHANNELS.openCashDrawer, saleId) as Promise<CashDrawerResult>,
  data: Object.freeze({
    createBackup: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.createBackup) as Promise<DataOperationResult>,
    restoreBackup: () =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.restoreBackup) as Promise<DataOperationResult>,
  }),
});

contextBridge.exposeInMainWorld('mizanDesktop', desktopApi);

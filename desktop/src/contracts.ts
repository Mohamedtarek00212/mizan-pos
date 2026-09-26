export const DESKTOP_CHANNELS = {
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

export interface DesktopAppInfo {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
}

export interface DesktopServerConfig {
  apiBaseUrl: string | null;
  runtimeMode: 'standalone' | 'external';
  runtimeState: 'stopped' | 'starting' | 'ready' | 'failed';
  runtimeErrorCode?: 'DATABASE_START_FAILED' | 'BACKEND_START_FAILED' | 'RUNTIME_UNAVAILABLE';
}

export type ServerConnectionErrorCode =
  | 'INVALID_URL'
  | 'INSECURE_URL'
  | 'UNREACHABLE'
  | 'UNHEALTHY'
  | 'INVALID_RESPONSE';

export interface ServerConnectionResult {
  ok: boolean;
  apiBaseUrl: string | null;
  status?: number;
  errorCode?: ServerConnectionErrorCode;
}

export interface DesktopSessionState {
  token: string | null;
  secureStorageAvailable: boolean;
}

export interface ReceiptPrintResult {
  ok: boolean;
  error?: 'INVALID_RECEIPT' | 'PRINT_FAILED' | 'PRINT_CANCELLED';
}

export interface CashDrawerResult {
  ok: boolean;
  error?: 'INVALID_REQUEST' | 'NOT_CONFIGURED' | 'CONNECTION_FAILED' | 'TIMEOUT';
}

export interface DataOperationResult {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  error?: 'UNAUTHORIZED' | 'STANDALONE_ONLY' | 'BACKUP_FAILED' | 'INVALID_BACKUP' | 'RESTORE_FAILED';
}

export interface MizanDesktopApi {
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

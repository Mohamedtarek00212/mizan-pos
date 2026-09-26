/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type DesktopServerConnectionErrorCode =
  | 'INVALID_URL'
  | 'INSECURE_URL'
  | 'UNREACHABLE'
  | 'UNHEALTHY'
  | 'INVALID_RESPONSE';

interface DesktopServerConnectionResult {
  ok: boolean;
  apiBaseUrl: string | null;
  status?: number;
  errorCode?: DesktopServerConnectionErrorCode;
}

interface Window {
  mizanDesktop?: {
    getAppInfo: () => Promise<{
      name: string;
      version: string;
      platform: string;
      isPackaged: boolean;
    }>;
    window: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<void>;
    };
    server: {
      getConfig: () => Promise<{
        apiBaseUrl: string | null;
        runtimeMode: 'standalone' | 'external';
        runtimeState: 'stopped' | 'starting' | 'ready' | 'failed';
        runtimeErrorCode?: 'DATABASE_START_FAILED' | 'BACKEND_START_FAILED' | 'RUNTIME_UNAVAILABLE';
      }>;
      testConnection: (apiBaseUrl: string) => Promise<DesktopServerConnectionResult>;
      saveConfig: (apiBaseUrl: string) => Promise<DesktopServerConnectionResult>;
      restartLocal: () => Promise<{
        apiBaseUrl: string | null;
        runtimeMode: 'standalone' | 'external';
        runtimeState: 'stopped' | 'starting' | 'ready' | 'failed';
        runtimeErrorCode?: 'DATABASE_START_FAILED' | 'BACKEND_START_FAILED' | 'RUNTIME_UNAVAILABLE';
      }>;
    };
    onNavigate: (callback: (path: string) => void) => () => void;
    session: {
      read: () => Promise<{ token: string | null; secureStorageAvailable: boolean }>;
      write: (token: string) => Promise<boolean>;
      clear: () => Promise<void>;
    };
    reportError: (message: string) => Promise<void>;
    printReceipt: (receiptNumber: number) => Promise<{
      ok: boolean;
      error?: 'INVALID_RECEIPT' | 'PRINT_FAILED' | 'PRINT_CANCELLED';
    }>;
    openCashDrawer: (saleId: number) => Promise<{
      ok: boolean;
      error?: 'INVALID_REQUEST' | 'NOT_CONFIGURED' | 'CONNECTION_FAILED' | 'TIMEOUT';
    }>;
    data: {
      createBackup: () => Promise<{
        ok: boolean;
        cancelled?: boolean;
        fileName?: string;
        error?: 'UNAUTHORIZED' | 'STANDALONE_ONLY' | 'BACKUP_FAILED' | 'INVALID_BACKUP' | 'RESTORE_FAILED';
      }>;
      restoreBackup: () => Promise<{
        ok: boolean;
        cancelled?: boolean;
        fileName?: string;
        error?: 'UNAUTHORIZED' | 'STANDALONE_ONLY' | 'BACKUP_FAILED' | 'INVALID_BACKUP' | 'RESTORE_FAILED';
      }>;
    };
  };
}

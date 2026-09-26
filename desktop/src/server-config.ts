import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type {
  DesktopServerConfig,
  ServerConnectionErrorCode,
  ServerConnectionResult,
} from './contracts';
import { getStandaloneRuntimeStatus } from './standalone-runtime';

const CONNECTION_TIMEOUT_MS = 6_000;

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'server-config.json');
}

function failure(
  errorCode: ServerConnectionErrorCode,
  apiBaseUrl: string | null = null,
  status?: number,
): ServerConnectionResult {
  return { ok: false, apiBaseUrl, errorCode, ...(status ? { status } : {}) };
}

export function normalizeApiBaseUrl(rawValue: string): ServerConnectionResult {
  try {
    const url = new URL(rawValue.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return failure('INVALID_URL');
    }

    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (app.isPackaged && url.protocol !== 'https:' && !isLoopback) {
      return failure('INSECURE_URL');
    }

    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/api';
    url.pathname = pathname;

    return { ok: true, apiBaseUrl: url.toString().replace(/\/$/, '') };
  } catch {
    return failure('INVALID_URL');
  }
}

export function readServerConfig(): DesktopServerConfig {
  const localRuntime = getStandaloneRuntimeStatus();
  if (localRuntime.state === 'ready' && localRuntime.apiBaseUrl) {
    return {
      apiBaseUrl: localRuntime.apiBaseUrl,
      runtimeMode: localRuntime.mode,
      runtimeState: localRuntime.state,
    };
  }
  if (localRuntime.mode === 'standalone') {
    return {
      apiBaseUrl: null,
      runtimeMode: localRuntime.mode,
      runtimeState: localRuntime.state,
      ...(localRuntime.errorCode ? { runtimeErrorCode: localRuntime.errorCode } : {}),
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configFilePath(), 'utf8')) as Partial<DesktopServerConfig>;
    if (typeof parsed.apiBaseUrl === 'string') {
      const normalized = normalizeApiBaseUrl(parsed.apiBaseUrl);
      if (normalized.ok) {
        return { apiBaseUrl: normalized.apiBaseUrl, runtimeMode: 'external', runtimeState: 'stopped' };
      }
    }
  } catch {
    // First launch and invalid local files both fall back to the setup screen.
  }
  return { apiBaseUrl: null, runtimeMode: 'external', runtimeState: 'stopped' };
}

export async function testServerConnection(rawValue: string): Promise<ServerConnectionResult> {
  const normalized = normalizeApiBaseUrl(rawValue);
  if (!normalized.ok || !normalized.apiBaseUrl) return normalized;

  try {
    const response = await net.fetch(`${normalized.apiBaseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return failure('UNHEALTHY', normalized.apiBaseUrl, response.status);

    const payload = (await response.json()) as { status?: unknown; database?: unknown };
    if (payload.status !== 'ok' || payload.database !== 'connected') {
      return failure('INVALID_RESPONSE', normalized.apiBaseUrl, response.status);
    }

    return { ok: true, apiBaseUrl: normalized.apiBaseUrl, status: response.status };
  } catch {
    return failure('UNREACHABLE', normalized.apiBaseUrl);
  }
}

export async function testAndSaveServerConfig(rawValue: string): Promise<ServerConnectionResult> {
  const result = await testServerConnection(rawValue);
  if (!result.ok || !result.apiBaseUrl) return result;

  const destination = configFilePath();
  const temporary = `${destination}.tmp`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify({ apiBaseUrl: result.apiBaseUrl }, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
  return result;
}

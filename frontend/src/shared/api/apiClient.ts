/**
 * Single typed API client (Step 6 §11 - Frontend Architecture).
 * Every backend call goes through here so auth-header attachment and
 * centralized 401/403 handling live in exactly one place.
 *
 * Feature clients for auth, catalog, registers, and sales all use these
 * shared request and error primitives.
 */
import i18n from '../../i18n/i18n';

let apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

type ConnectionHandler = (connected: boolean) => void;
const connectionHandlers = new Set<ConnectionHandler>();

export function setApiBaseUrl(value: string): void {
  apiBaseUrl = value.replace(/\/+$/, '');
}

export function subscribeToConnectionState(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler);
  return () => connectionHandlers.delete(handler);
}

function reportConnectionState(connected: boolean): void {
  connectionHandlers.forEach((handler) => handler(connected));
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(status: number, errorCode: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

let authToken: string | null = null;

/** Called by the Auth feature after login / on app bootstrap. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Centralized 401/403 handling: consumers register a callback (e.g. the
 * AuthContext) so this low-level client doesn't need to know about
 * routing/navigation concerns.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    reportConnectionState(true);
  } catch (error) {
    reportConnectionState(false);
    throw error;
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error_code ?? 'UNKNOWN_ERROR',
      payload?.message ?? i18n.t('common.requestFailed'),
      payload?.details,
    );
  }

  return payload as T;
}

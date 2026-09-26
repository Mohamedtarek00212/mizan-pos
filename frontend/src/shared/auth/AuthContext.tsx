import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import i18n from '../../i18n/i18n';
import { apiRequest, ApiError, setAuthToken, setUnauthorizedHandler } from '../api/apiClient';

/**
 * Global auth/session state (Step 6 §11 - "Auth/session state (global)").
 * Holds the current user + JWT, exposes login/logout, and reacts to
 * centralized 401s from the API client by clearing the session.
 *
 * Role-based navigation and route guarding consume this context. Token
 * refresh and "remember me" remain outside the current MVP scope.
 */

export type Role = 'CASHIER' | 'MANAGER' | 'INVENTORY_STAFF' | 'ADMIN';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_KEY = 'pos_access_token';

function browserStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function storedToken(): Promise<string | null> {
  if (window.mizanDesktop) {
    const session = await window.mizanDesktop.session.read();
    return session.token;
  }
  return browserStoredToken();
}

async function persistToken(token: string): Promise<void> {
  if (window.mizanDesktop) {
    await window.mizanDesktop.session.write(token);
    return;
  }
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The in-memory session remains available when storage is unavailable.
  }
}

async function clearStoredToken(): Promise<void> {
  if (window.mizanDesktop) {
    await window.mizanDesktop.session.clear();
    return;
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

interface LoginResponse {
  access_token: string;
  user_id: number;
  role: Role;
}

interface MeResponse {
  user_id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(
    () => Boolean(window.mizanDesktop) || Boolean(browserStoredToken()),
  );
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    void clearStoredToken();
  }, []);

  // Any 401 from any request clears the session (Step 5 A4 - live status
  // re-check means a session can become invalid between requests).
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    let active = true;
    void storedToken()
      .then(async (token) => {
        if (!active || !token) return;
        setAuthToken(token);
        const me = await apiRequest<MeResponse>('/auth/me');
        if (active) {
          setUser({ id: me.user_id, username: me.username, fullName: me.full_name, role: me.role });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) logout();
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setAuthToken(response.access_token);
      await persistToken(response.access_token);
      // `/auth/login` intentionally omits full_name (Step 5 B1) - fetch the
      // full identity via `/auth/me` immediately after.
      const me = await apiRequest<MeResponse>('/auth/me');
      setUser({ id: me.user_id, username: me.username, fullName: me.full_name, role: me.role });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : i18n.t('auth.loginFailed');
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, error, login, logout }),
    [user, isLoading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hooks intentionally share this module with their provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

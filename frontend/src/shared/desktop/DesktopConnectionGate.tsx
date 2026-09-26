import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import logoMark from '../../assets/brand/mizan-logo-mark.png';
import { LanguageSwitcher } from '../../i18n/LanguageSwitcher';
import { setApiBaseUrl, subscribeToConnectionState } from '../api/apiClient';

type GateState = 'loading' | 'configuring' | 'checking' | 'offline' | 'local-offline' | 'ready';

function errorTranslationKey(code?: DesktopServerConnectionErrorCode): string {
  switch (code) {
    case 'INVALID_URL': return 'desktopConnection.errors.invalidUrl';
    case 'INSECURE_URL': return 'desktopConnection.errors.insecureUrl';
    case 'UNHEALTHY': return 'desktopConnection.errors.unhealthy';
    case 'INVALID_RESPONSE': return 'desktopConnection.errors.invalidResponse';
    default: return 'desktopConnection.errors.unreachable';
  }
}

export function DesktopConnectionGate({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const desktopServer = window.mizanDesktop?.server;
  const [state, setState] = useState<GateState>(desktopServer ? 'loading' : 'ready');
  const [apiUrl, setApiUrl] = useState('http://localhost:4000/api');
  const [errorCode, setErrorCode] = useState<DesktopServerConnectionErrorCode>();

  const testConnection = useCallback(async (url: string, save: boolean) => {
    if (!desktopServer) return;
    setState('checking');
    setErrorCode(undefined);
    try {
      const result = save
        ? await desktopServer.saveConfig(url)
        : await desktopServer.testConnection(url);
      if (result.ok && result.apiBaseUrl) {
        setApiUrl(result.apiBaseUrl);
        setApiBaseUrl(result.apiBaseUrl);
        setState('ready');
        return;
      }
      setErrorCode(result.errorCode);
      setState(save ? 'configuring' : 'offline');
    } catch {
      setErrorCode('UNREACHABLE');
      setState(save ? 'configuring' : 'offline');
    }
  }, [desktopServer]);

  const restartLocal = useCallback(async () => {
    if (!desktopServer) return;
    setState('checking');
    try {
      const config = await desktopServer.restartLocal();
      if (config.runtimeState === 'ready' && config.apiBaseUrl) {
        setApiUrl(config.apiBaseUrl);
        await testConnection(config.apiBaseUrl, false);
        return;
      }
    } catch {
      // The recovery view below remains actionable.
    }
    setState('local-offline');
  }, [desktopServer, testConnection]);

  useEffect(() => {
    if (!desktopServer) return;
    let active = true;
    desktopServer.getConfig()
      .then(({ apiBaseUrl: savedUrl, runtimeMode, runtimeState }) => {
        if (!active) return;
        if (runtimeMode === 'standalone' && (runtimeState !== 'ready' || !savedUrl)) {
          setState('local-offline');
          return;
        }
        if (!savedUrl) {
          setState('configuring');
          return;
        }
        setApiUrl(savedUrl);
        void testConnection(savedUrl, false);
      })
      .catch(() => active && setState('configuring'));
    return () => { active = false; };
  }, [desktopServer, testConnection]);

  useEffect(() => {
    if (!desktopServer || state !== 'ready') return;
    return subscribeToConnectionState((connected) => {
      if (!connected) {
        setErrorCode('UNREACHABLE');
        setState('offline');
      }
    });
  }, [desktopServer, state]);

  if (state === 'ready') return <>{children}</>;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void testConnection(apiUrl, true);
  };

  return (
    <div className="desktop-connection-page">
      <LanguageSwitcher />
      <section className="desktop-connection-card" aria-live="polite">
        <img src={logoMark} alt="" className="desktop-connection-logo" />
        {state === 'loading' ? (
          <>
            <div className="desktop-connection-spinner" aria-hidden="true" />
            <h1>{t('desktopConnection.loadingTitle')}</h1>
            <p>{t('desktopConnection.loadingMessage')}</p>
          </>
        ) : state === 'local-offline' ? (
          <>
            <span className="desktop-connection-status desktop-connection-status--offline">●</span>
            <h1>{t('desktopConnection.localOfflineTitle')}</h1>
            <p>{t('desktopConnection.errors.localRuntime')}</p>
            <div className="desktop-connection-actions">
              <button type="button" onClick={() => void restartLocal()}>
                {t('desktopConnection.restartLocal')}
              </button>
            </div>
          </>
        ) : state === 'offline' ? (
          <>
            <span className="desktop-connection-status desktop-connection-status--offline">●</span>
            <h1>{t('desktopConnection.offlineTitle')}</h1>
            <p>{t(errorTranslationKey(errorCode))}</p>
            <code>{apiUrl}</code>
            <div className="desktop-connection-actions">
              <button type="button" onClick={() => void testConnection(apiUrl, false)}>
                {t('desktopConnection.retry')}
              </button>
              <button type="button" className="button-secondary" onClick={() => setState('configuring')}>
                {t('desktopConnection.changeServer')}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="desktop-connection-eyebrow">{t('desktopConnection.eyebrow')}</span>
            <h1>{t('desktopConnection.setupTitle')}</h1>
            <p>{t('desktopConnection.setupMessage')}</p>
            <form onSubmit={submit} className="desktop-connection-form">
              <label htmlFor="desktop-api-url">{t('desktopConnection.serverLabel')}</label>
              <input
                id="desktop-api-url"
                type="url"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="https://pos.example.com/api"
                dir="ltr"
                required
                autoFocus
                disabled={state === 'checking'}
              />
              <small>{t('desktopConnection.serverHint')}</small>
              {errorCode && <div className="desktop-connection-error">{t(errorTranslationKey(errorCode))}</div>}
              <button type="submit" disabled={state === 'checking'}>
                {state === 'checking' ? t('desktopConnection.checking') : t('desktopConnection.connect')}
              </button>
            </form>
          </>
        )}
      </section>
      <small className="desktop-connection-footer">{t('desktopConnection.localNotice')}</small>
    </div>
  );
}

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../shared/api/apiClient';
import { LanguageSwitcher } from '../../i18n/LanguageSwitcher';
import mizanLogoMark from '../../assets/brand/mizan-logo-mark.png';
import { SetupPayload, setupApi, SetupStatus } from './setupApi';

interface StoreProfile {
  storeName: string | null;
  currencyCode: string;
}

const StoreContext = createContext<StoreProfile>({ storeName: null, currencyCode: 'EGP' });

const initialPayload: SetupPayload = {
  store_name: '',
  admin_full_name: '',
  admin_username: '',
  admin_password: '',
  register_code: 'REG-1',
  register_name: '',
  tax_rate_pct: 0,
};

function SetupWizard({ onComplete }: { onComplete: (status: SetupStatus) => void }): JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialPayload);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validateStep = (): boolean => {
    setError(null);
    if (step === 0 && form.store_name.trim().length < 2) {
      setError(t('firstRun.errors.storeName'));
      return false;
    }
    if (step === 1) {
      if (form.admin_full_name.trim().length < 2 || form.admin_username.trim().length < 3) {
        setError(t('firstRun.errors.adminDetails'));
        return false;
      }
      if (
        form.admin_password.length < 10 ||
        !/[a-z]/.test(form.admin_password) ||
        !/[A-Z]/.test(form.admin_password) ||
        !/\d/.test(form.admin_password)
      ) {
        setError(t('firstRun.errors.passwordStrength'));
        return false;
      }
      if (form.admin_password !== confirmPassword) {
        setError(t('firstRun.errors.passwordMatch'));
        return false;
      }
    }
    if (step === 2 && (!form.register_code.trim() || form.register_name.trim().length < 2 || form.tax_rate_pct < 0 || form.tax_rate_pct > 100)) {
      setError(t('firstRun.errors.operations'));
      return false;
    }
    return true;
  };

  const next = (): void => {
    if (validateStep()) setStep((current) => Math.min(3, current + 1));
  };

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      onComplete(await setupApi.initialize({
        ...form,
        store_name: form.store_name.trim(),
        admin_full_name: form.admin_full_name.trim(),
        admin_username: form.admin_username.trim(),
        register_code: form.register_code.trim().toUpperCase(),
        register_name: form.register_name.trim(),
      }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.unknownError'));
    } finally {
      setSaving(false);
    }
  };

  return <div className="first-run-page">
    <LanguageSwitcher />
    <main className="first-run-shell">
      <section className="first-run-brand">
        <img src={mizanLogoMark} alt="" />
        <span>{t('firstRun.eyebrow')}</span>
        <h1>{t('firstRun.title')}</h1>
        <p>{t('firstRun.subtitle')}</p>
        <div className="first-run-progress" aria-label={t('firstRun.progress')}>
          {[0, 1, 2, 3].map((index) => <span key={index} className={index <= step ? 'active' : ''} />)}
        </div>
        <small>{t('firstRun.step', { current: step + 1, total: 4 })}</small>
      </section>
      <section className="first-run-card">
        {step === 0 && <>
          <h2>{t('firstRun.store.title')}</h2>
          <p>{t('firstRun.store.help')}</p>
          <label htmlFor="setup-store-name">{t('firstRun.store.name')}</label>
          <input id="setup-store-name" autoFocus maxLength={100} value={form.store_name}
            onChange={(event) => setForm({ ...form, store_name: event.target.value })} />
        </>}
        {step === 1 && <>
          <h2>{t('firstRun.admin.title')}</h2>
          <p>{t('firstRun.admin.help')}</p>
          <div className="first-run-grid">
            <div><label htmlFor="setup-admin-name">{t('firstRun.admin.fullName')}</label><input id="setup-admin-name" autoFocus maxLength={100} value={form.admin_full_name} onChange={(event) => setForm({ ...form, admin_full_name: event.target.value })} /></div>
            <div><label htmlFor="setup-admin-username">{t('firstRun.admin.username')}</label><input id="setup-admin-username" dir="ltr" maxLength={50} autoComplete="username" value={form.admin_username} onChange={(event) => setForm({ ...form, admin_username: event.target.value })} /></div>
            <div><label htmlFor="setup-admin-password">{t('firstRun.admin.password')}</label><input id="setup-admin-password" dir="ltr" type="password" maxLength={128} autoComplete="new-password" value={form.admin_password} onChange={(event) => setForm({ ...form, admin_password: event.target.value })} /></div>
            <div><label htmlFor="setup-admin-confirm">{t('firstRun.admin.confirm')}</label><input id="setup-admin-confirm" dir="ltr" type="password" maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
          </div>
          <small className="first-run-hint">{t('firstRun.admin.passwordHint')}</small>
        </>}
        {step === 2 && <>
          <h2>{t('firstRun.operations.title')}</h2>
          <p>{t('firstRun.operations.help')}</p>
          <div className="first-run-grid">
            <div><label htmlFor="setup-register-name">{t('firstRun.operations.registerName')}</label><input id="setup-register-name" autoFocus maxLength={100} value={form.register_name} placeholder={t('firstRun.operations.registerNamePlaceholder')} onChange={(event) => setForm({ ...form, register_name: event.target.value })} /></div>
            <div><label htmlFor="setup-register">{t('firstRun.operations.register')}</label><input id="setup-register" dir="ltr" maxLength={20} value={form.register_code} onChange={(event) => setForm({ ...form, register_code: event.target.value })} /></div>
            <div><label htmlFor="setup-tax">{t('firstRun.operations.tax')}</label><input id="setup-tax" dir="ltr" type="number" min="0" max="100" step="0.01" value={form.tax_rate_pct} onChange={(event) => setForm({ ...form, tax_rate_pct: Number(event.target.value) })} /></div>
          </div>
          <small className="first-run-hint">{t('firstRun.operations.taxHint')}</small>
        </>}
        {step === 3 && <>
          <h2>{t('firstRun.review.title')}</h2>
          <p>{t('firstRun.review.help')}</p>
          <dl className="first-run-review">
            <div><dt>{t('firstRun.store.name')}</dt><dd>{form.store_name}</dd></div>
            <div><dt>{t('firstRun.admin.fullName')}</dt><dd>{form.admin_full_name}</dd></div>
            <div><dt>{t('firstRun.admin.username')}</dt><dd dir="ltr">{form.admin_username}</dd></div>
            <div><dt>{t('firstRun.operations.registerName')}</dt><dd>{form.register_name}</dd></div>
            <div><dt>{t('firstRun.operations.register')}</dt><dd dir="ltr">{form.register_code.toUpperCase()}</dd></div>
            <div><dt>{t('firstRun.operations.tax')}</dt><dd>{form.tax_rate_pct}%</dd></div>
          </dl>
          <div className="first-run-ready">✓ {t('firstRun.review.ready')}</div>
        </>}
        {error && <div className="first-run-error" role="alert">{error}</div>}
        <div className="first-run-actions">
          {step > 0 && <button type="button" onClick={() => { setError(null); setStep(step - 1); }}>{t('firstRun.back')}</button>}
          {step < 3
            ? <button type="button" className="first-run-primary" onClick={next}>{t('firstRun.continue')}</button>
            : <button type="button" className="first-run-primary" disabled={saving} onClick={() => void submit()}>{saving ? t('firstRun.saving') : t('firstRun.finish')}</button>}
        </div>
      </section>
    </main>
  </div>;
}

export function StoreInitializationGate({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState(false);
  const profile = useMemo<StoreProfile>(() => ({
    storeName: status?.store_name ?? null,
    currencyCode: status?.currency_code ?? 'EGP',
  }), [status]);

  const load = useCallback(() => {
    setError(false);
    void setupApi.status().then(setStatus).catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  if (error) return <div className="first-run-loading"><p>{t('firstRun.statusFailed')}</p><button onClick={load}>{t('desktopConnection.retry')}</button></div>;
  if (!status) return <div className="first-run-loading"><span className="desktop-connection-spinner" /><p>{t('firstRun.checking')}</p></div>;
  if (!status.initialized) return <SetupWizard onComplete={setStatus} />;

  return <StoreContext.Provider value={profile}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStoreProfile(): StoreProfile {
  return useContext(StoreContext);
}

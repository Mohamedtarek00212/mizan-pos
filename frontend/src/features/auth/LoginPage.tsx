import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../shared/auth/AuthContext';
import mizanLogoMark from '../../assets/brand/mizan-logo-mark.png';
import mizanLoginIllustration from '../../assets/brand/mizan-login-illustration.png';

/** Branded entry point for all role-based workspaces. */
export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) {
    const redirectTo = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand" aria-label={t('brand.name')}>
        <img className="login-brand__visual" src={mizanLoginIllustration} alt="" />
        <div className="login-brand__content">
          <span className="login-brand__mark" aria-hidden="true">
            <img src={mizanLogoMark} alt="" />
          </span>
          <div>
            <h1>{t('brand.name')}</h1>
            <p>{t('brand.promise')}</p>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-card__mobile-brand" aria-hidden="true">
            <span className="login-brand__mark"><img src={mizanLogoMark} alt="" /></span>
            <strong>{t('brand.name')}</strong>
          </div>
          <h2>{t('auth.welcomeBack')}</h2>
          <p className="login-card__subtitle">{t('auth.loginSubtitle')}</p>
          <form onSubmit={handleSubmit}>
            <div className="login-field">
          <label htmlFor="username">{t('auth.usernameLabel')}</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
            <div className="login-field">
          <label htmlFor="password">{t('auth.passwordLabel')}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
            {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={isLoading}>
          {isLoading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
          <p className="login-hint">{t('auth.secureHint')}</p>
        </div>
      </section>
    </div>
  );
}

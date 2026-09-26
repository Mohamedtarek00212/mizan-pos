import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../shared/api/apiClient';
import { Role, useAuth } from '../../shared/auth/AuthContext';
import { CreateUserInput, UserSummary, usersApi } from './usersApi';
import { AlertBanner, Button, Card, PageContainer, PageHeading, Spinner, StatusBadge, inputStyle } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';

const ALL_ROLES: Role[] = ['CASHIER', 'MANAGER', 'INVENTORY_STAFF', 'ADMIN'];
const MANAGER_ASSIGNABLE_ROLES: Role[] = ['CASHIER', 'INVENTORY_STAFF'];

/**
 * Users management screen (Step 6 §5.21). Manager sees/creates only
 * Cashier/Inventory Staff accounts; Admin sees/creates any role - this
 * mirrors UP-03/UP-04, but is UX convenience only, the backend re-enforces
 * this scoping regardless (Step 5 A4/A17).
 */
export function UsersPage(): JSX.Element {
  const { t } = useTranslation();
  const { user: actingUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const assignableRoles = actingUser?.role === 'ADMIN' ? ALL_ROLES : MANAGER_ASSIGNABLE_ROLES;

  const [form, setForm] = useState<CreateUserInput>({
    username: '',
    password: '',
    full_name: '',
    role: assignableRoles[0],
  });

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await usersApi.list();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await usersApi.create(form);
      setForm({ username: '', password: '', full_name: '', role: assignableRoles[0] });
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('users.failedToCreate'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(target: UserSummary): Promise<void> {
    try {
      await usersApi.update(target.id, { is_active: !target.is_active });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.failedToUpdate'));
    }
  }

  function openPasswordReset(target: UserSummary): void {
    setPasswordTarget(target);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  function closePasswordReset(): void {
    if (isResettingPassword) return;
    setPasswordTarget(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  }

  async function handlePasswordReset(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!passwordTarget) return;
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError(t('users.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('users.passwordMismatch'));
      return;
    }

    setIsResettingPassword(true);
    try {
      await usersApi.update(passwordTarget.id, { password: newPassword });
      setPasswordTarget(null);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('users.passwordResetSuccess', { name: passwordTarget.full_name }));
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t('users.passwordResetFailed'));
    } finally {
      setIsResettingPassword(false);
    }
  }

  return (
    <PageContainer maxWidth={1050}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="users" size={28} /></span><div><PageHeading>{t('users.title')}</PageHeading><p>{t('users.subtitle')}</p></div></header>

      <Card>
      <form onSubmit={handleCreate}>
        <div className="admin-form-title"><strong>{t('users.newUserHeading')}</strong><small>{t('users.formHint')}</small></div>
        <div className="user-form-grid">
          <input
            aria-label={t('users.usernamePlaceholder')}
            placeholder={t('users.usernamePlaceholder')}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            style={inputStyle}
          />
          <input
            aria-label={t('users.fullNamePlaceholder')}
            placeholder={t('users.fullNamePlaceholder')}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
            style={inputStyle}
          />
          <input
            aria-label={t('users.passwordPlaceholder')}
            placeholder={t('users.passwordPlaceholder')}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
            style={inputStyle}
          />
          <select
            aria-label={t('users.tableRole')}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            style={inputStyle}
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('users.creatingButton') : t('users.createButton')}
          </Button>
        </div>
        {formError && <AlertBanner tone="danger">{formError}</AlertBanner>}
      </form>
      </Card>

      {isLoading && <div className="page-loading"><Spinner /> <span>{t('users.loading')}</span></div>}
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {passwordSuccess && <AlertBanner tone="success">{passwordSuccess}</AlertBanner>}

      {!isLoading && !error && (
        <Card><div className="data-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>{t('users.tableUsername')}</th>
              <th>{t('users.tableFullName')}</th>
              <th>{t('users.tableRole')}</th>
              <th>{t('users.tableStatus')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td><span className="role-pill">{t(`roles.${u.role}`)}</span></td>
                <td><StatusBadge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? t('common.status.active') : t('common.status.deactivated')}</StatusBadge></td>
                <td><div className="user-row-actions">
                  <Button variant="secondary" onClick={() => openPasswordReset(u)}>
                    {t('users.resetPassword')}
                  </Button>
                  <Button variant="secondary" onClick={() => handleToggleActive(u)}>
                    {u.is_active ? t('common.actions.deactivate') : t('common.actions.activate')}
                  </Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div></Card>
      )}

      {passwordTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('users.resetPasswordFor', { name: passwordTarget.full_name })}
          className="modal-backdrop"
        >
          <Card className="password-reset-dialog">
            <form onSubmit={handlePasswordReset}>
              <h2>{t('users.resetPassword')}</h2>
              <p>{t('users.resetPasswordFor', { name: passwordTarget.full_name })}</p>
              <label htmlFor="new-user-password">{t('users.newPassword')}</label>
              <input
                id="new-user-password"
                autoFocus
                autoComplete="new-password"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                style={inputStyle}
              />
              <label htmlFor="confirm-user-password">{t('users.confirmPassword')}</label>
              <input
                id="confirm-user-password"
                autoComplete="new-password"
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                style={inputStyle}
              />
              <small className="password-reset-hint">{t('users.passwordResetHint')}</small>
              {passwordError && <AlertBanner tone="danger">{passwordError}</AlertBanner>}
              <div className="password-reset-actions">
                <Button type="button" variant="secondary" disabled={isResettingPassword} onClick={closePasswordReset}>
                  {t('common.actions.cancel')}
                </Button>
                <Button type="submit" disabled={isResettingPassword}>
                  {isResettingPassword ? t('users.resettingPassword') : t('users.saveNewPassword')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

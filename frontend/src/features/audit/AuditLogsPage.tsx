import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeading,
  Spinner,
  inputStyle,
} from '../../shared/ui/primitives';
import { theme } from '../../shared/ui/theme';
import { Icon } from '../../shared/ui/Icon';
import { AuditFilters, AuditLog, auditApi } from './auditApi';
import { usersApi, UserSummary } from '../users/usersApi';

const entityTypes = ['STORE', 'USER', 'CATEGORY', 'PRODUCT', 'REGISTER_SESSION', 'SALE', 'SALE_ITEM', 'PAYMENT', 'STOCK_MOVEMENT', 'RETURN', 'REFUND', 'PROMOTION', 'APPROVAL', 'TAX_RATE'];
const actionTypes = ['SYSTEM_INITIALIZED', 'USER_CREATED', 'USER_UPDATED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DEACTIVATED', 'REGISTER_OPENED', 'REGISTER_CLOSED', 'SALE_CREATED', 'SALE_ITEM_ADDED', 'SALE_ITEM_UPDATED', 'SALE_PAYMENT_RECORDED', 'SALE_COMPLETED', 'SALE_VOIDED', 'STOCK_MOVEMENT_CREATED', 'CASH_DRAWER_OPEN_REQUESTED', 'DISCOUNT_APPLIED', 'DISCOUNT_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_DENIED', 'RETURN_REQUESTED', 'RETURN_REFUNDED', 'RETURN_REJECTED', 'REFUND_RETRIED', 'PROMOTION_CREATED', 'PROMOTION_UPDATED', 'TAX_RATE_CREATED', 'LOGIN_FAILED'];

export function AuditLogsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    void usersApi.list().then((result) => {
      if (!cancelled) setUsers(result.users);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await auditApi.list(filters);
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('audit.failed'));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }
  return (
    <PageContainer maxWidth={1180}>
      <header className="section-page-header"><span className="section-page-header__icon"><Icon name="audit" size={28} /></span><div><PageHeading>{t('audit.title')}</PageHeading><p>{t('audit.subtitle')}</p></div><Link className="action-link" to="/reports">{t('dashboard.reportsLink')}</Link></header>
      <Card>
        <form onSubmit={submit} className="admin-filter-grid audit-filter-grid">
          <select aria-label={t('audit.entityType')} value={filters.entityType ?? ''} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} style={inputStyle}>
            <option value="">{t('audit.allEntities')}</option>
            {entityTypes.map((type) => <option key={type} value={type}>{t(`audit.entities.${type}`, { defaultValue: type })}</option>)}
          </select>
          <input aria-label={t('audit.entityId')} type="number" min="1" placeholder={t('audit.entityReference')} value={filters.entityId ?? ''} onChange={(e) => setFilters({ ...filters, entityId: e.target.value })} style={inputStyle} />
          <select aria-label={t('audit.actorId')} value={filters.actorId ?? ''} onChange={(e) => setFilters({ ...filters, actorId: e.target.value })} style={inputStyle}>
            <option value="">{t('audit.allUsers')}</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name} (@{user.username})</option>)}
          </select>
          <select aria-label={t('audit.actionType')} value={filters.actionType ?? ''} onChange={(e) => setFilters({ ...filters, actionType: e.target.value })} style={inputStyle}>
            <option value="">{t('audit.allActions')}</option>
            {actionTypes.map((action) => <option key={action} value={action}>{t(`audit.actions.${action}`, { defaultValue: action })}</option>)}
          </select>
          <input
            aria-label={t('audit.from')}
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            style={inputStyle}
          />
          <input
            aria-label={t('audit.to')}
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            style={inputStyle}
          />
          <Button type="submit">{t('audit.filter')}</Button>
        </form>
      </Card>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {loading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <EmptyState>{t('audit.empty')}</EmptyState>
      ) : (
        <>
          <p style={{ color: theme.color.textMuted }}>{t('audit.total', { count: total })}</p>
          {logs.map((log) => (
            <Card key={log.id} style={{ padding: 14 }}>
              <button
                type="button"
                aria-expanded={expanded === log.id}
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="audit-log-button"
                style={{
                  border: 0,
                  background: 'transparent',
                  width: '100%',
                  textAlign: 'start',
                  cursor: 'pointer',
                  color: theme.color.text,
                }}
              >
                <strong>{t(`audit.actions.${log.action_type}`, { defaultValue: log.action_type })}</strong> · {t(`audit.entities.${log.entity_type}`, { defaultValue: log.entity_type })} <span dir="ltr">#{log.entity_id}</span>
                <div style={{ color: theme.color.textMuted, marginTop: 6 }}>
                  {new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-EG', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(log.created_at))}{' '}
                  · {log.actor_name} <span dir="ltr">(@{log.actor_username})</span>
                </div>
                {log.reason && (
                  <div>
                    {t('audit.reason')}: {log.reason}
                  </div>
                )}
              </button>
              {expanded === log.id && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <div>
                    <strong>{t('audit.before')}</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {JSON.stringify(log.before_snapshot, null, 2) || '—'}
                    </pre>
                  </div>
                  <div>
                    <strong>{t('audit.after')}</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {JSON.stringify(log.after_snapshot, null, 2) || '—'}
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </PageContainer>
  );
}

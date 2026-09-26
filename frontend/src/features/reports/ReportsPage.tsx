import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrencyEGP, formatDate, formatNumber } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeading,
  Spinner,
  StatusBadge,
  inputStyle,
} from '../../shared/ui/primitives';
import { theme } from '../../shared/ui/theme';
import { Icon } from '../../shared/ui/Icon';
import { ReportFilters, ReportResult, ReportType, reportsApi } from './reportsApi';
import { registersApi, Register } from '../registers/registersApi';
import { usersApi, UserSummary } from '../users/usersApi';
import { productsApi, Product } from '../catalog/productsApi';
import { categoriesApi, Category } from '../catalog/categoriesApi';

const types: ReportType[] = ['sales', 'cash', 'inventory', 'returns'];

function cell(value: unknown): string {
  return value === null || value === undefined ? '—' : String(value);
}

export function ReportsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState<ReportType>('sales');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      registersApi.list(),
      usersApi.list(),
      productsApi.list(),
      categoriesApi.list(),
    ]).then(([registerResult, userResult, productResult, categoryResult]) => {
      if (cancelled) return;
      setRegisters(registerResult.registers);
      setUsers(userResult.users);
      setProducts(productResult.products);
      setCategories(categoryResult.categories);
    }).catch(() => {
      // Reports remain usable even if one optional selector cannot be populated.
    });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await reportsApi.get(type, filters));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('reports.failed'));
    } finally {
      setLoading(false);
    }
  }, [filters, t, type]);
  useEffect(() => {
    void load();
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  const currency = (value: unknown) => formatCurrencyEGP(Number(value ?? 0), i18n.language);
  const number = (value: unknown) => formatNumber(Number(value ?? 0), i18n.language);
  const summaryEntries = result ? Object.entries(result.summary) : [];

  return (
    <PageContainer maxWidth={1180}>
      <header className="section-page-header"><span className="section-page-header__icon"><Icon name="report" size={28} /></span><div><PageHeading>{t('reports.title')}</PageHeading><p>{t('reports.subtitle')}</p></div><Link className="action-link" to="/audit-logs">{t('dashboard.auditLink')}</Link></header>
      <div className="admin-tabs" role="tablist" aria-label={t('reports.reportType')}>
        {types.map((item) => (
          <Button
            key={item}
            type="button"
            role="tab"
            aria-selected={type === item}
            variant={type === item ? 'primary' : 'secondary'}
            onClick={() => setType(item)}
          >
            {t(`reports.types.${item}`)}
          </Button>
        ))}
      </div>
      <Card>
        <form onSubmit={submit} className="admin-filter-grid">
          <input
            aria-label={t('reports.from')}
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            style={inputStyle}
          />
          <input
            aria-label={t('reports.to')}
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            style={inputStyle}
          />
          {type !== 'inventory' && (
            <select
              aria-label={t('reports.registerId')}
              value={filters.registerId ?? ''}
              onChange={(e) => setFilters({ ...filters, registerId: e.target.value })}
              style={inputStyle}
            >
              <option value="">{t('reports.allRegisters')}</option>
              {registers.map((register) => <option key={register.id} value={register.id}>{register.display_name} ({register.code})</option>)}
            </select>
          )}
          {(type === 'sales' || type === 'cash' || type === 'returns') && (
            <select
              aria-label={t('reports.cashierId')}
              value={filters.cashierId ?? ''}
              onChange={(e) => setFilters({ ...filters, cashierId: e.target.value })}
              style={inputStyle}
            >
              <option value="">{t('reports.allCashiers')}</option>
              {users.filter((user) => user.role === 'CASHIER').map((user) => <option key={user.id} value={user.id}>{user.full_name} (@{user.username})</option>)}
            </select>
          )}
          {(type === 'sales' || type === 'inventory' || type === 'returns') && (
            <select
              aria-label={t('reports.productId')}
              value={filters.productId ?? ''}
              onChange={(e) => setFilters({ ...filters, productId: e.target.value })}
              style={inputStyle}
            >
              <option value="">{t('reports.allProducts')}</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
            </select>
          )}
          {type === 'inventory' && (
            <select
              aria-label={t('reports.categoryId')}
              value={filters.categoryId ?? ''}
              onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
              style={inputStyle}
            >
              <option value="">{t('reports.allCategories')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          )}
          <Button type="submit">{t('reports.run')}</Button>
        </form>
      </Card>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {loading ? (
        <Spinner />
      ) : (
        result && (
          <>
            <div className="report-summary-grid">
              {summaryEntries.map(([key, value]) => (
                <Card key={key} style={{ margin: 0 }}>
                  <div>{t(`reports.fields.${key}`)}</div>
                  <strong>
                    {key.includes('amount') ||
                    [
                      'subtotal',
                      'discounts',
                      'tax',
                      'total',
                      'average_sale',
                      'expected_cash',
                      'counted_cash',
                      'net_variance',
                    ].includes(key)
                      ? currency(value)
                      : number(value)}
                  </strong>
                </Card>
              ))}
            </div>
            {result.rows.length === 0 ? (
              <EmptyState>{t('reports.empty')}</EmptyState>
            ) : (
              <Card>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {Object.keys(result.rows[0]).map((key) => (
                          <th key={key} style={{ padding: 9, textAlign: 'start' }}>
                            {t(`reports.fields.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, index) => (
                        <tr
                          key={String(row.id ?? row.date ?? index)}
                          style={{ borderTop: `1px solid ${theme.color.border}` }}
                        >
                          {Object.entries(row).map(([key, value]) => (
                            <td key={key} style={{ padding: 9 }}>
                              {key.endsWith('_at') || key === 'date' ? (
                                formatDate(String(value), i18n.language)
                              ) : key === 'stock_status' ? (
                                <StatusBadge
                                  tone={
                                    value === 'OUT'
                                      ? 'danger'
                                      : value === 'LOW'
                                        ? 'warning'
                                        : 'success'
                                  }
                                >
                                  {t(`inventory.statuses.${String(value)}`)}
                                </StatusBadge>
                              ) : key.includes('amount') ||
                                [
                                  'total',
                                  'discounts',
                                  'tax',
                                  'expected_cash',
                                  'counted_cash',
                                  'variance',
                                  'variance_threshold_snapshot',
                                  'refunded_amount',
                                ].includes(key) ? (
                                currency(value)
                              ) : typeof value === 'boolean' ? (
                                value ? (
                                  t('reports.yes')
                                ) : (
                                  t('reports.no')
                                )
                              ) : (
                                cell(value)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )
      )}
    </PageContainer>
  );
}

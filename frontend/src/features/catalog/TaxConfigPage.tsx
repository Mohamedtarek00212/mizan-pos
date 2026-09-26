import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatPercent } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import { useAuth } from '../../shared/auth/AuthContext';
import { AlertBanner, Button, Card, EmptyState, PageContainer, PageHeading, Spinner, inputStyle } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { Category, categoriesApi } from './categoriesApi';
import { TaxRate, taxRatesApi } from './taxRatesApi';

/**
 * Tax Configuration screen (Step 6 route table: Manager view-only, Admin
 * view+edit). "Tax configuration remains Admin-controlled" - only Admin
 * can submit a new effective-dated rate version.
 */
export function TaxConfigPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [rates, setRates] = useState<TaxRate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');
  const [ratePct, setRatePct] = useState<string>('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await taxRatesApi.listCurrent();
      setRates(res.tax_rates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('taxConfig.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    categoriesApi.list().then((res) => setCategories(res.categories));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function categoryLabel(id: number | null): string {
    if (id === null) return t('taxConfig.globalOption');
    return categories.find((c) => c.id === id)?.name ?? t('taxConfig.categoryFallback', { id });
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);
    const pct = Number(ratePct);
    if (Number.isNaN(pct) || pct < 0) {
      setFormError(t('taxConfig.rateInvalid'));
      return;
    }
    try {
      await taxRatesApi.create(categoryId ? Number(categoryId) : null, pct);
      setCategoryId('');
      setRatePct('');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('taxConfig.failedToCreate'));
    }
  }

  return (
    <PageContainer maxWidth={900}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="tax" size={28} /></span><div><PageHeading>{t('taxConfig.title')}</PageHeading><p>{t('taxConfig.subtitle')}</p></div></header>

      {isAdmin && (
        <Card>
        <form onSubmit={handleCreate}>
          <div className="admin-form-title"><strong>{t('taxConfig.newRateHeading')}</strong><small>{t('taxConfig.formHint')}</small></div>
          <div className="tax-form-grid">
            <select aria-label={t('taxConfig.tableScope')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
              <option value="">{t('taxConfig.globalOption')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={t('taxConfig.ratePlaceholder')}
              aria-label={t('taxConfig.tableRate')}
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              required
              style={inputStyle}
            />
            <Button type="submit" disabled={!ratePct}>{t('taxConfig.setRateButton')}</Button>
          </div>
          {formError && <AlertBanner tone="danger">{formError}</AlertBanner>}
        </form>
        </Card>
      )}

      {!isAdmin && <AlertBanner tone="warning">{t('taxConfig.readOnly')}</AlertBanner>}
      {isLoading && <div className="page-loading"><Spinner /> <span>{t('taxConfig.loading')}</span></div>}
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}

      {!isLoading && !error && rates.length === 0 && <EmptyState>{t('taxConfig.empty')}</EmptyState>}
      {!isLoading && !error && rates.length > 0 && (
        <Card>
        <div className="data-table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>{t('taxConfig.tableScope')}</th>
              <th>{t('taxConfig.tableRate')}</th>
              <th>{t('taxConfig.tableEffectiveFrom')}</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{categoryLabel(r.category_id)}</td>
                <td>{formatPercent(r.rate_pct, i18n.language)}</td>
                <td>{formatDate(r.effective_from, i18n.language)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        </Card>
      )}
    </PageContainer>
  );
}

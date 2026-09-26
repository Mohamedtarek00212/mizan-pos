import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCurrencyEGP, formatNumber, formatPercent } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import { AlertBanner, Card, EmptyState, PageContainer, PageHeading, Spinner, StatusBadge } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { Category, categoriesApi } from './categoriesApi';
import { Product, productsApi } from './productsApi';

/**
 * Products screen (Step 6 §5.11). Browse/search the catalog - all
 * price/stock/tax values displayed here come directly from the backend
 * response, never computed client-side.
 */
export function ProductsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isActive, setIsActive] = useState<string>('true');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await productsApi.list({
        q: q || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
      });
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('products.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [q, categoryId, isActive, t]);

  useEffect(() => {
    categoriesApi.list().then((res) => setCategories(res.categories));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer maxWidth={1100}>
      <header className="section-page-header">
        <span className="section-page-header__icon"><Icon name="product" size={28} /></span>
        <div><PageHeading>{t('products.title')}</PageHeading><p>{t('products.subtitle')}</p></div>
        <Link className="action-link" to="/products/new">+ {t('products.newProductButton')}</Link>
      </header>

      <Card style={{ padding: 14 }}>
      <div className="catalog-filter-bar">
        <input
          aria-label={t('products.searchPlaceholder')}
          placeholder={t('products.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label={t('products.tableCategory')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('products.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label={t('products.tableStatus')} value={isActive} onChange={(e) => setIsActive(e.target.value)}>
          <option value="true">{t('common.status.active')}</option>
          <option value="false">{t('common.status.deactivated')}</option>
          <option value="">{t('products.allStatuses')}</option>
        </select>
      </div>
      </Card>

      {isLoading && <div className="page-loading"><Spinner /> <span>{t('products.loading')}</span></div>}
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {!isLoading && !error && products.length === 0 && <EmptyState>{t('products.empty')}</EmptyState>}

      {!isLoading && !error && products.length > 0 && (
        <>
          <div className="catalog-result-count">{t('products.resultCount', { count: products.length })}</div>
          <div className="product-card-grid">
            {products.map((p) => (
              <article key={p.id} className={`product-card${p.is_active ? '' : ' product-card--inactive'}`}>
                <div className="product-card__top">
                  <span className="product-card__mark"><Icon name="product" size={23} /></span>
                  <StatusBadge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? t('common.status.active') : t('common.status.deactivated')}</StatusBadge>
                </div>
                <h3>{p.name}</h3>
                <p>{p.category_name}</p>
                <div className="product-card__price">{formatCurrencyEGP(p.current_price, i18n.language)}</div>
                <div className="product-card__facts">
                  <span><small>{t('products.tableStock')}</small><strong>{formatNumber(p.current_stock, i18n.language)}</strong></span>
                  <span><small>{t('products.tableTax')}</small><strong>{p.effective_tax_rate_pct !== null ? formatPercent(p.effective_tax_rate_pct, i18n.language) : '—'}</strong></span>
                </div>
                <div className="product-card__codes"><span>{t('products.tableSku')}: {p.sku}</span><span>{t('products.tableBarcode')}: {p.barcode ?? '—'}</span></div>
                <Link className="product-card__edit" to={`/products/${p.id}`}>{t('products.editLink')} ←</Link>
              </article>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

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
  StatusBadge,
  inputStyle,
} from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { InventoryProduct, inventoryApi } from './inventoryApi';

function tone(status: InventoryProduct['stock_status']): 'success' | 'warning' | 'danger' {
  if (status === 'OUT') return 'danger';
  if (status === 'LOW') return 'warning';
  return 'success';
}

export function InventoryPage(): JSX.Element {
  const { t } = useTranslation();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q?: string) => {
      setLoading(true);
      setError(null);
      try {
        setProducts((await inventoryApi.list(q)).products);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('inventory.failed'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function submit(e: FormEvent): void {
    e.preventDefault();
    void load(search.trim() || undefined);
  }

  const lowCount = products.filter((product) => product.stock_status === 'LOW').length;
  const outCount = products.filter((product) => product.stock_status === 'OUT').length;
  const availableCount = products.filter((product) => product.stock_status === 'OK').length;

  return (
    <PageContainer maxWidth={1100}>
      <header className="section-page-header">
        <span className="section-page-header__icon"><Icon name="inventory" size={28} /></span>
        <div>
          <PageHeading>{t('inventory.title')}</PageHeading>
          <p>{t('inventory.subtitle')}</p>
        </div>
        <Link className="action-link" to="/inventory/low-stock">{t('inventory.lowStock')}</Link>
      </header>
      <div className="inventory-metrics" aria-label={t('inventory.summary')}>
        <div><span>{t('inventory.totalProducts')}</span><strong>{products.length}</strong></div>
        <div className="inventory-metric--ok"><span>{t('inventory.statuses.OK')}</span><strong>{availableCount}</strong></div>
        <div className="inventory-metric--low"><span>{t('inventory.statuses.LOW')}</span><strong>{lowCount}</strong></div>
        <div className="inventory-metric--out"><span>{t('inventory.statuses.OUT')}</span><strong>{outCount}</strong></div>
      </div>
      <Card style={{ padding: 14 }}>
        <form onSubmit={submit} className="catalog-search-form">
          <input
            aria-label={t('inventory.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.searchPlaceholder')}
            style={inputStyle}
          />
          <Button type="submit">{t('pos.search')}</Button>
        </form>
      </Card>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState>{t('inventory.empty')}</EmptyState>
      ) : (
        <div className="inventory-card-grid">
          {products.map((product) => {
            const ratio = product.reorder_threshold > 0
              ? Math.min(100, (product.current_stock / product.reorder_threshold) * 100)
              : 100;
            return (
              <article key={product.id} className={`inventory-card inventory-card--${product.stock_status.toLowerCase()}`}>
                <div className="inventory-card__top">
                  <div><strong>{product.name}</strong><small>{product.sku} · {product.category_name}</small></div>
                  <StatusBadge tone={tone(product.stock_status)}>{t(`inventory.statuses.${product.stock_status}`)}</StatusBadge>
                </div>
                <div className="inventory-card__stock">
                  <strong>{product.current_stock}</strong><span>{t('inventory.unitsAvailable')}</span>
                </div>
                <div className="inventory-card__progress"><span style={{ width: `${ratio}%` }} /></div>
                <div className="inventory-card__threshold">{t('inventory.threshold')}: <strong>{product.reorder_threshold}</strong></div>
                <div className="inventory-card__actions">
                  <Link className="action-link action-link--compact" to={`/inventory/adjust/${product.id}`}>{t('inventory.adjust')}</Link>
                  <Link to={`/inventory/movements/${product.id}`}>{t('inventory.movements')}</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Card,
  PageContainer,
  PageHeading,
  Spinner,
  StatusBadge,
} from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { InventoryProduct, inventoryApi } from './inventoryApi';

export function LowStockPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    inventoryApi
      .lowStock()
      .then((result) => setProducts(result.products))
      .catch((err) => setError(err instanceof ApiError ? err.message : t('inventory.failed')))
      .finally(() => setLoading(false));
  }, [t]);
  return (
    <PageContainer maxWidth={850}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="inventory" size={28} /></span><div><PageHeading>{t('inventory.lowStock')}</PageHeading><p>{t('inventory.lowStockSubtitle')}</p></div></header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <AlertBanner tone="success">{t('inventory.noLowStock')}</AlertBanner>
      ) : (
        <Card style={{ padding: 12 }}>
          {products.map((product) => (
            <div key={product.id} className="low-stock-row">
              <div>
                <strong>{product.name}</strong>
                <div>
                  {t('inventory.stock')}: {product.current_stock} · {t('inventory.threshold')}:{' '}
                  {product.reorder_threshold}
                </div>
                {product.last_restock_at && (
                  <small>
                    {t('inventory.lastRestock')}:{' '}
                    {new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-EG', {
                      dateStyle: 'medium',
                    }).format(new Date(product.last_restock_at))}
                  </small>
                )}
              </div>
              <div className="low-stock-row__actions">
                <StatusBadge tone={product.stock_status === 'OUT' ? 'danger' : 'warning'}>
                  {t(`inventory.statuses.${product.stock_status}`)}
                </StatusBadge>
                <Link className="action-link action-link--compact" to={`/inventory/adjust/${product.id}`}>{t('inventory.restock')}</Link>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Link to="/inventory">{t('inventory.back')}</Link>
    </PageContainer>
  );
}

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
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
import { InventoryProduct, MovementType, StockMovement, inventoryApi } from './inventoryApi';

export function StockMovementsPage(): JSX.Element {
  const { productId } = useParams();
  const id = Number(productId);
  const { t, i18n } = useTranslation();
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementType, setMovementType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [found, result] = await Promise.all([
        inventoryApi.getProduct(id),
        inventoryApi.movements(id, {
          movementType: movementType || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        }),
      ]);
      setProduct(found);
      setMovements(result.movements);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('inventory.failed'));
    } finally {
      setLoading(false);
    }
  }, [from, id, movementType, t, to]);
  useEffect(() => {
    void load();
  }, [load]);
  function filter(e: FormEvent): void {
    e.preventDefault();
    void load();
  }

  return (
    <PageContainer maxWidth={1000}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="inventory" size={28} /></span><div><PageHeading>{t('inventory.movementTitle', { name: product?.name ?? `#${id}` })}</PageHeading><p>{t('inventory.movementSubtitle')}</p></div></header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      <Card>
        <form onSubmit={filter} className="movement-filter-form">
          <select
            aria-label={t('inventory.movementType')}
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            style={inputStyle}
          >
            <option value="">{t('inventory.allMovements')}</option>
            {(['SALE', 'RETURN_RESTOCK', 'MANUAL_ADD', 'MANUAL_ADJUST'] as MovementType[]).map(
              (type) => (
                <option key={type} value={type}>
                  {t(`inventory.movementTypes.${type}`)}
                </option>
              ),
            )}
          </select>
          <input
            aria-label={t('inventory.from')}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
          <input
            aria-label={t('inventory.to')}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
          <Button type="submit">{t('inventory.filter')}</Button>
        </form>
      </Card>
      {loading ? (
        <Spinner />
      ) : movements.length === 0 ? (
        <EmptyState>{t('inventory.noMovements')}</EmptyState>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>{t('inventory.date')}</th>
                  <th>{t('inventory.movementType')}</th>
                  <th>{t('inventory.delta')}</th>
                  <th>{t('inventory.result')}</th>
                  <th>{t('inventory.actor')}</th>
                  <th>{t('inventory.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} style={{ borderTop: `1px solid ${theme.color.border}` }}>
                    <td style={{ padding: 9 }}>
                      {new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-EG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(movement.created_at))}
                    </td>
                    <td>{t(`inventory.movementTypes.${movement.movement_type}`)}</td>
                    <td
                      style={{
                        color:
                          movement.quantity_delta > 0 ? theme.color.success : theme.color.danger,
                        fontWeight: 700,
                      }}
                    >
                      {movement.quantity_delta > 0 ? '+' : ''}
                      {movement.quantity_delta}
                    </td>
                    <td>{movement.resulting_stock}</td>
                    <td>#{movement.performed_by}</td>
                    <td>{movement.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Link to="/inventory">{t('inventory.back')}</Link>
    </PageContainer>
  );
}

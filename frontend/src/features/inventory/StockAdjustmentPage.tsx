import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Button,
  Card,
  FieldLabel,
  PageContainer,
  PageHeading,
  Spinner,
  inputStyle,
} from '../../shared/ui/primitives';
import { theme } from '../../shared/ui/theme';
import { Icon } from '../../shared/ui/Icon';
import { InventoryProduct, inventoryApi } from './inventoryApi';

export function StockAdjustmentPage(): JSX.Element {
  const { productId } = useParams();
  const { t } = useTranslation();
  const id = Number(productId);
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [mode, setMode] = useState<'ADD' | 'ADJUST'>('ADD');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const delta = Number(quantity);
  const validQuantity =
    quantity !== '' && Number.isInteger(delta) && (mode === 'ADD' ? delta > 0 : delta !== 0);
  const projected = useMemo(
    () =>
      product && Number.isFinite(delta)
        ? product.current_stock + (mode === 'ADD' ? Math.abs(delta) : delta)
        : product?.current_stock,
    [delta, mode, product],
  );

  useEffect(() => {
    if (!Number.isInteger(id)) {
      setError(t('inventory.invalidProduct'));
      setLoading(false);
      return;
    }
    inventoryApi
      .getProduct(id)
      .then(setProduct)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('inventory.failed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!product) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result =
        mode === 'ADD'
          ? await inventoryApi.add(product.id, delta, reason)
          : await inventoryApi.adjust(product.id, delta, reason);
      setProduct(result.product);
      setQuantity('');
      setReason('');
      setNotice(t('inventory.saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('inventory.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <PageContainer>
        <Spinner />
      </PageContainer>
    );
  return (
    <PageContainer maxWidth={620}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="inventory" size={28} /></span><div><PageHeading>{t('inventory.adjustTitle')}</PageHeading><p>{t('inventory.adjustSubtitle')}</p></div></header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {notice && <AlertBanner tone="success">{notice}</AlertBanner>}
      {product && (
        <Card>
          <div className="stock-adjust-product"><div><h2>{product.name}</h2><small>{product.sku} · {product.category_name}</small></div><div><span>{t('inventory.currentStock')}</span><strong>{product.current_stock}</strong></div></div>
          <div className="stock-adjust-tabs">
            <Button
              type="button"
              variant={mode === 'ADD' ? 'primary' : 'secondary'}
              onClick={() => setMode('ADD')}
            >
              {t('inventory.restock')}
            </Button>
            <Button
              type="button"
              variant={mode === 'ADJUST' ? 'primary' : 'secondary'}
              onClick={() => setMode('ADJUST')}
            >
              {t('inventory.correction')}
            </Button>
          </div>
          <form onSubmit={submit} className="stock-adjust-form">
            <FieldLabel>
              {mode === 'ADD' ? t('inventory.quantity') : t('inventory.quantityDelta')}
            </FieldLabel>
            <input
              aria-label={mode === 'ADD' ? t('inventory.quantity') : t('inventory.quantityDelta')}
              type="number"
              step="1"
              min={mode === 'ADD' ? 1 : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={inputStyle}
              required
            />
            <FieldLabel>{t('inventory.reason')}</FieldLabel>
            <input
              aria-label={t('inventory.reason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('inventory.reasonHint')}
              style={inputStyle}
              required
            />
            <div
              className="stock-projection"
              style={{
                color:
                  projected !== undefined && projected < 0
                    ? theme.color.danger
                    : theme.color.textMuted,
              }}
            >
              <span>{t('inventory.projectedStock')}</span><strong>{projected}</strong>
            </div>
            {projected !== undefined && projected < 0 && (
              <AlertBanner tone="danger">{t('inventory.negativeWarning')}</AlertBanner>
            )}
            <Button
              type="submit"
              disabled={
                saving ||
                !validQuantity ||
                !reason.trim() ||
                projected === undefined ||
                projected < 0
              }
            >
              {saving ? t('common.actions.saving') : t('common.actions.save')}
            </Button>
          </form>
          <p className="stock-movements-link">
            <Link to={`/inventory/movements/${product.id}`}>{t('inventory.viewMovements')}</Link>
          </p>
        </Card>
      )}
      <Link to="/inventory">{t('inventory.back')}</Link>
    </PageContainer>
  );
}

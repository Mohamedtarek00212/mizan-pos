import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  FieldLabel,
  PageContainer,
  PageHeading,
  Spinner,
  StatusBadge,
  inputStyle,
} from '../../shared/ui/primitives';
import { theme } from '../../shared/ui/theme';
import { Icon } from '../../shared/ui/Icon';
import { DiscountType, Promotion, PromotionScope, promotionsApi } from './promotionsApi';

function localDateTime(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function PromotionsPage(): JSX.Element {
  const { t } = useTranslation();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<PromotionScope>('GENERAL');
  const [targetId, setTargetId] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENT');
  const [value, setValue] = useState('');
  const [startsAt, setStartsAt] = useState(localDateTime(0));
  const [endsAt, setEndsAt] = useState(localDateTime(7));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPromotions((await promotionsApi.list()).promotions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('promotions.failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent): Promise<void> {
    e.preventDefault();
    const numericValue = Number(value);
    const numericTarget = Number(targetId);
    setSaving(true);
    setError(null);
    try {
      const created = await promotionsApi.create({
        name: name.trim(),
        scope,
        product_id: scope === 'PRODUCT' ? numericTarget : undefined,
        category_id: scope === 'CATEGORY' ? numericTarget : undefined,
        discount_type: discountType,
        discount_value: numericValue,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      });
      setPromotions((current) => [created, ...current]);
      setName('');
      setTargetId('');
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('promotions.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(promotion: Promotion): Promise<void> {
    try {
      const updated = await promotionsApi.setActive(promotion.id, !promotion.is_active);
      setPromotions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('promotions.saveFailed'));
    }
  }

  return (
    <PageContainer maxWidth={1000}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="promotion" size={28} /></span><div><PageHeading>{t('promotions.title')}</PageHeading><p>{t('promotions.subtitle')}</p></div></header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      <Card>
        <div className="admin-form-title"><strong>{t('promotions.newPromotion')}</strong><small>{t('promotions.formHint')}</small></div>
        <form onSubmit={create} className="admin-form-grid">
          <div>
            <FieldLabel>{t('promotions.name')}</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <FieldLabel>{t('promotions.scope')}</FieldLabel>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as PromotionScope)}
              style={inputStyle}
            >
              <option value="GENERAL">{t('promotions.general')}</option>
              <option value="CATEGORY">{t('promotions.category')}</option>
              <option value="PRODUCT">{t('promotions.product')}</option>
            </select>
          </div>
          {scope !== 'GENERAL' && (
            <div>
              <FieldLabel>{t('promotions.targetId')}</FieldLabel>
              <input
                type="number"
                min="1"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          )}
          <div>
            <FieldLabel>{t('promotions.discountType')}</FieldLabel>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as DiscountType)}
              style={inputStyle}
            >
              <option value="PERCENT">{t('promotions.percentage')}</option>
              <option value="FIXED">{t('promotions.fixed')}</option>
            </select>
          </div>
          <div>
            <FieldLabel>{t('promotions.value')}</FieldLabel>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <FieldLabel>{t('promotions.startsAt')}</FieldLabel>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <FieldLabel>{t('promotions.endsAt')}</FieldLabel>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !value || (scope !== 'GENERAL' && !targetId)}
            >
              {saving ? t('common.actions.saving') : t('promotions.create')}
            </Button>
          </div>
        </form>
      </Card>
      {loading ? (
        <Spinner />
      ) : promotions.length === 0 ? (
        <EmptyState>{t('promotions.empty')}</EmptyState>
      ) : (
        <div className="admin-list-grid">{promotions.map((promotion) => (
          <Card key={promotion.id} style={{ margin: 0 }}>
            <div className="promotion-card">
            <div>
              <strong>{promotion.name}</strong>
              <div style={{ color: theme.color.textMuted, marginTop: 5 }}>
                {promotion.scope} · {promotion.discount_value}
                {promotion.discount_type === 'PERCENT' ? '%' : ' EGP'} ·{' '}
                {new Date(promotion.starts_at).toLocaleString()} –{' '}
                {new Date(promotion.ends_at).toLocaleString()}
              </div>
            </div>
            <div className="promotion-card__actions">
              <StatusBadge tone={promotion.is_active ? 'success' : 'neutral'}>
                {promotion.is_active ? t('common.status.active') : t('common.status.deactivated')}
              </StatusBadge>
              <Button variant="secondary" onClick={() => toggle(promotion)}>
                {promotion.is_active
                  ? t('common.actions.deactivate')
                  : t('common.actions.activate')}
              </Button>
            </div>
            </div>
          </Card>
        ))}</div>
      )}
    </PageContainer>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { formatCurrencyEGP } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import { useAuth } from '../../shared/auth/AuthContext';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeading,
  Spinner,
  StatusBadge,
} from '../../shared/ui/primitives';
import { ReturnDetail, returnsApi } from './returnsApi';

export function ReturnDetailPage(): JSX.Element {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const returnId = Number(id);
  const canRetry = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    if (!Number.isInteger(returnId)) {
      setError(t('returns.invalidId'));
      setLoading(false);
      return;
    }
    try {
      setDetail(await returnsApi.get(returnId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.failed'));
    } finally {
      setLoading(false);
    }
  }, [returnId, t]);
  useEffect(() => {
    void load();
  }, [load]);

  async function retry(): Promise<void> {
    setRetrying(true);
    setError(null);
    try {
      setDetail(await returnsApi.retry(returnId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.retryFailed'));
    } finally {
      setRetrying(false);
    }
  }

  if (loading)
    return (
      <PageContainer>
        <Spinner />
      </PageContainer>
    );
  if (!detail)
    return (
      <PageContainer>
        <EmptyState>{error ?? t('returns.failed')}</EmptyState>
      </PageContainer>
    );
  const hasFailed = detail.refunds.some((refund) => refund.status === 'FAILED');
  return (
    <PageContainer maxWidth={800}>
      <PageHeading>{t('returns.detailTitle', { id: detail.id })}</PageHeading>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      <Card>
        <p>
          <strong>{t('returns.status')}:</strong>{' '}
          <StatusBadge
            tone={
              detail.status === 'REFUNDED'
                ? 'success'
                : detail.status === 'REJECTED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {detail.status}
          </StatusBadge>
        </p>
        <p>
          <strong>{t('returns.originalSale')}:</strong>{' '}
          {detail.sale_id ? `#${detail.sale_id}` : t('returns.noReceipt')}
        </p>
        <p>
          <strong>{t('returns.reason')}:</strong> {detail.reason}
        </p>
        <p>
          <strong>{t('returns.totalRefund')}:</strong>{' '}
          {formatCurrencyEGP(detail.total_refund_amount, i18n.language)}
        </p>
      </Card>
      <Card>
        <h2>{t('returns.items')}</h2>
        {detail.items.map((item) => (
          <p key={item.id}>
            {item.product_name ?? `#${item.product_id}`} × {item.quantity} —{' '}
            {formatCurrencyEGP(item.refund_amount, i18n.language)} ·{' '}
            {item.resellable ? t('returns.restocked') : t('returns.discarded')}
          </p>
        ))}
      </Card>
      <Card>
        <h2>{t('returns.refunds')}</h2>
        {detail.refunds.length === 0 ? (
          <EmptyState>{t('returns.noRefunds')}</EmptyState>
        ) : (
          detail.refunds.map((refund) => (
            <p key={refund.id}>
              {refund.method} — {formatCurrencyEGP(refund.amount, i18n.language)} —{' '}
              <StatusBadge tone={refund.status === 'COMPLETED' ? 'success' : 'danger'}>
                {refund.status}
              </StatusBadge>
            </p>
          ))
        )}
        {canRetry && hasFailed && (
          <Button onClick={retry} disabled={retrying}>
            {retrying ? t('pos.processing') : t('returns.retry')}
          </Button>
        )}
      </Card>
      <Link to="/returns">{t('returns.back')}</Link>
    </PageContainer>
  );
}

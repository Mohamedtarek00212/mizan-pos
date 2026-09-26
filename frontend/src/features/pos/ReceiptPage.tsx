import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCurrencyEGP, formatDateTime } from '../../i18n/formatters';
import { theme } from '../../shared/ui/theme';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeading,
  Spinner,
} from '../../shared/ui/primitives';
import { ApiError } from '../../shared/api/apiClient';
import { Sale, salesApi } from './salesApi';
import { useStoreProfile } from '../setup/StoreInitializationGate';

export function ReceiptPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { saleId } = useParams<{ saleId: string }>();
  const { storeName } = useStoreProfile();

  const [sale, setSale] = useState<Sale | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const printReceipt = async (): Promise<void> => {
    if (!sale?.receipt_number || isPrinting) return;
    setPrintError(null);
    setIsPrinting(true);
    try {
      if (window.mizanDesktop) {
        const result = await window.mizanDesktop.printReceipt(sale.receipt_number);
        if (!result.ok && result.error !== 'PRINT_CANCELLED') {
          setPrintError(t('receipt.printFailed'));
        }
      } else {
        window.print();
      }
    } catch {
      setPrintError(t('receipt.printFailed'));
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const id = Number(saleId);
    if (Number.isNaN(id)) {
      setError(t('receipt.invalidSale'));
      setIsLoading(false);
      return;
    }

    salesApi
      .getById(id)
      .then((data) => {
        if (!cancelled) {
          setSale(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t('receipt.failedToLoad'));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [saleId, t]);

  if (isLoading) {
    return (
      <PageContainer>
        <Spinner />
      </PageContainer>
    );
  }

  if (error || !sale) {
    return (
      <PageContainer>
        {error && <AlertBanner tone="danger">{error}</AlertBanner>}
        <EmptyState>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('receipt.notFound')}</div>
          <div style={{ marginBottom: 16 }}>{t('receipt.notFoundMessage')}</div>
        </EmptyState>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/pos')}>{t('receipt.backToPos')}</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeading>{t('receipt.title')}</PageHeading>
      {printError && <AlertBanner tone="danger">{printError}</AlertBanner>}
      <Card className="receipt-paper" style={{ maxWidth: 480, margin: '24px auto', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{storeName ?? t('receipt.storeName')}</h2>
          <div style={{ color: theme.color.textMuted, fontSize: 14, marginTop: 4 }}>
            {t('receipt.sale')} #{sale.id}
          </div>
          {sale.receipt_number && (
            <div style={{ color: theme.color.textMuted, fontSize: 14 }}>
              {t('receipt.receiptNumber')}: {sale.receipt_number}
            </div>
          )}
          <div style={{ color: theme.color.textMuted, fontSize: 13, marginTop: 8 }}>
            {sale.completed_at
              ? formatDateTime(new Date(sale.completed_at), i18n.language)
              : '-'}
          </div>
        </div>

        <div style={{ borderTop: `1px dashed ${theme.color.border}`, paddingTop: 16 }}>
          {sale.items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                fontSize: 14,
                borderBottom: `1px solid ${theme.color.border}`,
                gap: 12,
              }}
            >
              <span style={{ flex: 1, wordBreak: 'break-word' }}>
                {item.product_name ?? `${t('receipt.product')} #${item.product_id}`} ×{' '}
                {item.quantity}
              </span>
              <span style={{ flex: '0 0 auto', textAlign: 'end' }}>
                {formatCurrencyEGP(item.line_total, i18n.language)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{t('receipt.subtotal')}</span>
            <span>{formatCurrencyEGP(sale.subtotal_amount, i18n.language)}</span>
          </div>
          {sale.discount_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{t('receipt.discount')}</span>
              <span>-{formatCurrencyEGP(sale.discount_amount, i18n.language)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{t('receipt.tax')}</span>
            <span>{formatCurrencyEGP(sale.tax_amount, i18n.language)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 0',
              marginTop: 8,
              borderTop: `1px solid ${theme.color.border}`,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            <span>{t('receipt.total')}</span>
            <span>{formatCurrencyEGP(sale.total_amount, i18n.language)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 0',
              color: theme.color.textMuted,
            }}
          >
            <span>{t('receipt.paid')}</span>
            <span>{formatCurrencyEGP(sale.total_paid, i18n.language)}</span>
          </div>
          {sale.cash_change_due > 0 && (
            <div className="receipt-change-row">
              <span>{t('receipt.changeDue')}</span>
              <strong>{formatCurrencyEGP(sale.cash_change_due, i18n.language)}</strong>
            </div>
          )}
        </div>

        <div
          className="receipt-actions"
          style={{
            marginTop: 24,
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Button variant="secondary" onClick={() => navigate('/pos')}>
            {t('receipt.backToPos')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void printReceipt()}
            disabled={isPrinting || !sale.receipt_number}
          >
            {isPrinting ? t('receipt.printing') : t('receipt.print')}
          </Button>
          <Button onClick={() => navigate('/pos')}>{t('receipt.newSale')}</Button>
        </div>
      </Card>
    </PageContainer>
  );
}

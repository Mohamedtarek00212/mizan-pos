import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrencyEGP } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import { useAuth } from '../../shared/auth/AuthContext';
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
import { Icon } from '../../shared/ui/Icon';
import { Sale } from '../pos/salesApi';
import { ReturnDetail, returnsApi } from './returnsApi';

function statusTone(status: ReturnDetail['status']): 'neutral' | 'warning' | 'success' | 'danger' {
  if (status === 'REFUNDED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'APPROVED') return 'warning';
  return 'neutral';
}

export function ReturnsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [mode, setMode] = useState<'RECEIPT' | 'NO_RECEIPT'>('RECEIPT');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [resellable, setResellable] = useState<Record<number, boolean>>({});
  const [productId, setProductId] = useState('');
  const [noReceiptQuantity, setNoReceiptQuantity] = useState('1');
  const [noReceiptResellable, setNoReceiptResellable] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returns, setReturns] = useState<ReturnDetail[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [pending, setPending] = useState<{ approvalId: number; returnId: number } | null>(null);
  const [managerUsername, setManagerUsername] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  const selectedItemCount =
    sale?.items.reduce((total, item) => total + Math.max(0, Number(quantities[item.id] ?? 0)), 0) ?? 0;
  const estimatedRefund =
    sale?.items.reduce((total, item) => {
      const quantity = Math.max(0, Number(quantities[item.id] ?? 0));
      const unitAmount = item.quantity > 0 ? item.line_total / item.quantity : 0;
      return total + Math.min(quantity, item.quantity) * unitAmount;
    }, 0) ?? 0;
  const canSubmitReturn =
    reason.trim().length > 0 &&
    (mode === 'RECEIPT'
      ? Boolean(sale && selectedItemCount > 0)
      : Number.isInteger(Number(productId)) &&
        Number(productId) > 0 &&
        Number(noReceiptQuantity) > 0);

  const canList = user?.role === 'MANAGER' || user?.role === 'ADMIN';
  const loadReturns = useCallback(async () => {
    if (!canList) return;
    setLoadingList(true);
    try {
      setReturns((await returnsApi.list()).returns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.failed'));
    } finally {
      setLoadingList(false);
    }
  }, [canList, t]);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  async function lookup(e: FormEvent): Promise<void> {
    e.preventDefault();
    const number = Number(receiptNumber);
    if (!Number.isInteger(number) || number <= 0) return;
    setBusy(true);
    setError(null);
    setSale(null);
    try {
      const found = await returnsApi.lookupReceipt(number);
      setSale(found);
      setQuantities({});
      setResellable(Object.fromEntries(found.items.map((item) => [item.id, true])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.lookupFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const items =
        mode === 'RECEIPT'
          ? (sale?.items ?? []).flatMap((item) => {
              const quantity = Number(quantities[item.id] ?? 0);
              return quantity > 0
                ? [{ sale_item_id: item.id, quantity, resellable: resellable[item.id] ?? true }]
                : [];
            })
          : [
              {
                product_id: Number(productId),
                quantity: Number(noReceiptQuantity),
                resellable: noReceiptResellable,
              },
            ];
      const result = await returnsApi.create({
        sale_id: mode === 'RECEIPT' ? sale?.id : undefined,
        reason,
        items,
      });
      if (result.approval_pending && result.approval_id) {
        setPending({ approvalId: result.approval_id, returnId: result.return.id });
      } else {
        setNotice(t('returns.refunded', { id: result.return.id }));
        setReturns((current) => [result.return, ...current]);
        resetForm();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  function resetForm(): void {
    setSale(null);
    setReceiptNumber('');
    setQuantities({});
    setReason('');
    setProductId('');
    setNoReceiptQuantity('1');
    setNoReceiptResellable(true);
  }

  function closeApproval(): void {
    setPending(null);
    setManagerUsername('');
    setManagerPassword('');
    setApprovalNote('');
  }

  async function decide(decision: 'APPROVE' | 'DENY'): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await returnsApi.decideInline(pending.approvalId, {
        manager_username: managerUsername,
        manager_password: managerPassword,
        decision,
        note: approvalNote.trim() || undefined,
      });
      if (result.return) setReturns((current) => [result.return!, ...current]);
      setNotice(decision === 'APPROVE' ? t('returns.approved') : t('returns.denied'));
      setPending(null);
      setManagerUsername('');
      setManagerPassword('');
      setApprovalNote('');
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('returns.approvalFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer maxWidth={1100}>
      <header className="returns-header">
        <span className="returns-header__icon"><Icon name="return" size={28} /></span>
        <div>
          <PageHeading>{t('returns.title')}</PageHeading>
          <p>{t('returns.subtitle')}</p>
        </div>
      </header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {notice && <AlertBanner tone="success">{notice}</AlertBanner>}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="returns-mode-tabs" role="tablist" aria-label={t('returns.returnType')}>
          <Button
            type="button"
            variant={mode === 'RECEIPT' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={mode === 'RECEIPT'}
            onClick={() => {
              setMode('RECEIPT');
              setError(null);
            }}
          >
            {t('returns.withReceipt')}
          </Button>
          <Button
            type="button"
            variant={mode === 'NO_RECEIPT' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={mode === 'NO_RECEIPT'}
            onClick={() => {
              setMode('NO_RECEIPT');
              setSale(null);
              setError(null);
            }}
          >
            {t('returns.withoutReceipt')}
          </Button>
        </div>
        <div className="returns-workspace">
        {mode === 'RECEIPT' ? (
          <>
            <form onSubmit={lookup} className="returns-lookup">
              <div className="returns-step-marker">1</div>
              <div className="returns-step-copy">
                <strong>{t('returns.findReceiptTitle')}</strong>
                <small>{t('returns.findReceiptHint')}</small>
              </div>
              <div className="returns-lookup__controls">
                <input
                  aria-label={t('returns.receiptNumber')}
                  type="number"
                  min="1"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder={t('returns.receiptNumber')}
                  style={inputStyle}
                />
                <Button type="submit" disabled={busy || !receiptNumber}>
                  {busy ? t('returns.searching') : t('returns.lookup')}
                </Button>
              </div>
            </form>
            {sale && (
              <div className="returns-sale">
                <div className="returns-sale__heading">
                  <div>
                    <span className="returns-step-marker">2</span>
                    <strong>{t('returns.chooseItems')}</strong>
                  </div>
                  <StatusBadge tone="success">{t('returns.saleFound', { id: sale.id })}</StatusBadge>
                </div>
                <p className="returns-window-notice">{t('returns.windowNotice')}</p>
                {sale.items.map((item) => (
                  <div key={item.id} className="returns-item">
                    <div className="returns-item__identity">
                      <strong>{item.product_name ?? `#${item.product_id}`}</strong>
                      <small>
                        {formatCurrencyEGP(item.line_total, i18n.language)} ·{' '}
                        {t('returns.soldQty', { quantity: item.quantity })}
                      </small>
                    </div>
                    <label className="returns-item__quantity">
                      <span>{t('returns.returnQty')}</span>
                      <input
                        aria-label={`${t('returns.returnQty')} ${item.id}`}
                        type="number"
                        min="0"
                        max={item.quantity}
                        step="1"
                        value={quantities[item.id] ?? ''}
                        onChange={(e) =>
                          setQuantities((current) => ({ ...current, [item.id]: e.target.value }))
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label className="returns-restock-option">
                      <input
                        type="checkbox"
                        checked={resellable[item.id] ?? true}
                        onChange={(e) =>
                          setResellable((current) => ({ ...current, [item.id]: e.target.checked }))
                        }
                      />{' '}
                      {t('returns.resellable')}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="returns-no-receipt">
            <div className="returns-no-receipt__heading">
              <span className="returns-step-marker">1</span>
              <div><strong>{t('returns.enterProduct')}</strong><small>{t('returns.enterProductHint')}</small></div>
            </div>
            <div>
              <FieldLabel>{t('returns.productId')}</FieldLabel>
              <input
                aria-label={t('returns.productId')}
                type="number"
                min="1"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>{t('returns.returnQty')}</FieldLabel>
              <input
                aria-label={t('returns.returnQty')}
                type="number"
                min="1"
                value={noReceiptQuantity}
                onChange={(e) => setNoReceiptQuantity(e.target.value)}
                style={inputStyle}
              />
            </div>
            <label className="returns-restock-option">
              <input
                type="checkbox"
                checked={noReceiptResellable}
                onChange={(e) => setNoReceiptResellable(e.target.checked)}
              />{' '}
              {t('returns.resellable')}
            </label>
            <div className="returns-no-receipt__warning"><AlertBanner tone="warning">{t('returns.noReceiptWarning')}</AlertBanner></div>
          </div>
        )}
        {(sale || mode === 'NO_RECEIPT') && (
          <form onSubmit={submit} className="returns-submit">
            <div className="returns-submit__reason">
              <FieldLabel>{t('returns.reason')}</FieldLabel>
              <input
                aria-label={t('returns.reason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('returns.reasonPlaceholder')}
                style={inputStyle}
                required
              />
            </div>
            {mode === 'RECEIPT' && (
              <div className="returns-summary" aria-live="polite">
                <span>{t('returns.selectedQuantity')}</span>
                <strong>{selectedItemCount}</strong>
                <span>{t('returns.estimatedRefund')}</span>
                <strong>{formatCurrencyEGP(estimatedRefund, i18n.language)}</strong>
              </div>
            )}
            <Button type="submit" disabled={busy || !canSubmitReturn}>
              {busy ? t('returns.processing') : t('returns.submit')}
            </Button>
          </form>
        )}
        </div>
      </Card>
      {canList && (
        <Card>
          <h2 className="returns-history-title">{t('returns.history')}</h2>
          {loadingList ? (
            <Spinner />
          ) : returns.length === 0 ? (
            <EmptyState>{t('returns.empty')}</EmptyState>
          ) : (
            returns.map((item) => (
              <div key={item.id} className="returns-history-row">
                <Link to={`/returns/${item.id}`}>
                  #{item.id} · {formatCurrencyEGP(item.total_refund_amount, i18n.language)}
                </Link>
                <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
              </div>
            ))
          )}
        </Card>
      )}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('returns.managerApproval')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <Card style={{ width: '100%', maxWidth: 440, margin: 0 }}>
            <h2>{t('returns.managerApproval')}</h2>
            <p>{t('returns.returnPending', { id: pending.returnId })}</p>
            <input
              aria-label={t('pos.managerUsername')}
              autoFocus
              value={managerUsername}
              onChange={(e) => setManagerUsername(e.target.value)}
              placeholder={t('pos.managerUsername')}
              style={inputStyle}
            />
            <input
              aria-label={t('pos.managerPassword')}
              type="password"
              value={managerPassword}
              onChange={(e) => setManagerPassword(e.target.value)}
              placeholder={t('pos.managerPassword')}
              style={{ ...inputStyle, marginTop: 10 }}
            />
            <input
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder={t('pos.approvalNote')}
              style={{ ...inputStyle, marginTop: 10 }}
            />
            <div className="returns-approval-actions">
              <Button variant="secondary" disabled={busy} onClick={closeApproval}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={busy || !managerUsername || !managerPassword}
                onClick={() => decide('DENY')}
              >
                {t('pos.deny')}
              </Button>
              <Button
                disabled={busy || !managerUsername || !managerPassword}
                onClick={() => decide('APPROVE')}
              >
                {t('pos.approve')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCurrencyEGP } from '../../i18n/formatters';
import { theme } from '../../shared/ui/theme';
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
import { ApiError } from '../../shared/api/apiClient';
import { Product, productsApi } from '../catalog/productsApi';
import { RegisterSession, registersApi } from '../registers/registersApi';
import { Sale, SaleItem, salesApi } from './salesApi';
import { Icon } from '../../shared/ui/Icon';

type OpenSession = RegisterSession;

function saleStatusTone(status: string): 'neutral' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'PAYMENT_PENDING':
      return 'warning';
    case 'VOIDED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function PosHeader({
  session,
  sale,
  onVoid,
  onHold,
}: {
  session: OpenSession;
  sale: Sale;
  onVoid: () => void;
  onHold: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="pos-header">
      <div>
        <PageHeading>{t('pos.title')}</PageHeading>
        <div style={{ fontSize: 14, color: theme.color.textMuted, marginTop: 4 }}>
          {t('pos.sessionLabel')} #{session.id} (
          {session.register_code || `${t('openRegister.registerLabel')} #${session.register_id}`})
        </div>
      </div>
      <div className="pos-header__actions">
        <StatusBadge tone={saleStatusTone(sale.status)}>
          {t(`pos.statuses.${sale.status}`, { defaultValue: sale.status })}
        </StatusBadge>
        {sale.status === 'DRAFT' && sale.items.length > 0 && (
          <Button variant="secondary" onClick={onHold}>
            {t('pos.hold')}
          </Button>
        )}
        {sale.status !== 'COMPLETED' && sale.status !== 'VOIDED' && (
          <Button variant="secondary" onClick={onVoid}>
            {t('pos.void')}
          </Button>
        )}
      </div>
    </div>
  );
}

function CartItemRow({
  item,
  onChangeQty,
  disabled,
}: {
  item: SaleItem;
  onChangeQty: (delta: number) => void;
  disabled: boolean;
}): JSX.Element {
  const { i18n } = useTranslation();
  return (
    <div
      className="pos-cart-item"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '12px 0',
        borderBottom: `1px solid ${theme.color.border}`,
      }}
    >
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {item.product_name ?? `Product #${item.product_id}`}
        </div>
        <div style={{ fontSize: 13, color: theme.color.textMuted }}>
          {formatCurrencyEGP(item.unit_price_snapshot, i18n.language)} × {item.quantity}
        </div>
      </div>
      <div
        className="pos-cart-item__controls"
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}
      >
        <Button
          variant="secondary"
          onClick={() => onChangeQty(-1)}
          disabled={disabled || item.quantity <= 0}
          style={{ minWidth: 36, padding: '8px 10px' }}
          aria-label="decrease quantity"
        >
          −
        </Button>
        <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 600 }}>
          {item.quantity}
        </span>
        <Button
          variant="secondary"
          onClick={() => onChangeQty(1)}
          disabled={disabled}
          style={{ minWidth: 36, padding: '8px 10px' }}
          aria-label="increase quantity"
        >
          +
        </Button>
        <div style={{ minWidth: 80, textAlign: 'end', fontWeight: 600 }}>
          {formatCurrencyEGP(item.line_total, i18n.language)}
        </div>
      </div>
    </div>
  );
}

function TotalsPanel({ sale }: { sale: Sale }): JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <div
      style={{ marginTop: 'auto', paddingTop: 16, borderTop: `2px solid ${theme.color.border}` }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
        <span>{t('pos.subtotal')}</span>
        <span>{formatCurrencyEGP(sale.subtotal_amount, i18n.language)}</span>
      </div>
      {sale.discount_amount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            color: theme.color.success,
          }}
        >
          <span>{t('pos.discount')}</span>
          <span>-{formatCurrencyEGP(sale.discount_amount, i18n.language)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
        <span>{t('pos.tax')}</span>
        <span>{formatCurrencyEGP(sale.tax_amount, i18n.language)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 0',
          marginTop: 8,
          borderTop: `1px solid ${theme.color.border}`,
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        <span>{t('pos.total')}</span>
        <span>{formatCurrencyEGP(sale.total_amount, i18n.language)}</span>
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}
      >
        <span>{t('pos.paid')}</span>
        <span>{formatCurrencyEGP(sale.total_paid, i18n.language)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 0',
          fontSize: 14,
          color: sale.remaining_balance > 0 ? theme.color.warning : theme.color.textMuted,
          fontWeight: sale.remaining_balance > 0 ? 600 : 400,
        }}
      >
        <span>{t('pos.remaining')}</span>
        <span>{formatCurrencyEGP(sale.remaining_balance, i18n.language)}</span>
      </div>
    </div>
  );
}

/**
 * POS checkout screen (Step 6 §5). Requires the current cashier to have an
 * open register session. Adds items by product id/barcode, lets the cashier
 * adjust quantities, then record cash/card payments and finalize.
 */
export function PosPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [session, setSession] = useState<OpenSession | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [autoStartSale, setAutoStartSale] = useState(true);
  const [heldSales, setHeldSales] = useState<Sale[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [barcode, setBarcode] = useState('');
  const [productIdInput, setProductIdInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [drawerWarning, setDrawerWarning] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [cardUncertain, setCardUncertain] = useState(false);

  const [discountScope, setDiscountScope] = useState<'ITEM' | 'SALE'>('SALE');
  const [discountItemId, setDiscountItemId] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountNotice, setDiscountNotice] = useState<string | null>(null);
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    id: number;
    amountContext: string;
  } | null>(null);
  const [managerUsername, setManagerUsername] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isDecidingApproval, setIsDecidingApproval] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const scanQueueRef = useRef<Promise<void>>(Promise.resolve());

  const loadSession = useCallback(async () => {
    setIsLoadingSession(true);
    setLoadError(null);
    try {
      const data = await registersApi.getMyCurrentSession();
      setSession(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setSession(null);
      } else {
        setLoadError(err instanceof ApiError ? err.message : t('pos.failedToLoad'));
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, [t]);

  const startNewSale = useCallback(
    async (sessionId: number) => {
      try {
        const newSale = await salesApi.create(sessionId);
        setSale(newSale);
        setPaymentAmount('');
        setPaymentError(null);
        setCompleteError(null);
        setCardUncertain(false);
        setAddError(null);
        setAutoStartSale(true);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : t('pos.failedToLoad'));
      }
    },
    [t],
  );

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session && !sale && !isLoadingSession && autoStartSale) {
      startNewSale(session.id);
    }
  }, [session, sale, isLoadingSession, autoStartSale, startNewSale]);

  const refreshHeldSales = useCallback(async () => {
    if (!session) return;
    try {
      const result = await salesApi.listHeld(session.id);
      setHeldSales(result.sales);
    } catch {
      // The active sale remains usable if this secondary list cannot load.
    }
  }, [session]);

  useEffect(() => {
    void refreshHeldSales();
  }, [refreshHeldSales]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, [sale]);

  const addBarcodeToSale = useCallback(
    (rawBarcode: string): Promise<void> => {
      const normalizedBarcode = rawBarcode.trim();
      const saleId = sale?.id;
      if (!normalizedBarcode || !saleId) return Promise.resolve();

      const operation = async () => {
        setIsAddingItem(true);
        setAddError(null);
        try {
          const product = await productsApi.lookupByBarcode(normalizedBarcode);
          if (!product) {
            setAddError(t('pos.scannerUnknown', { barcode: normalizedBarcode }));
            return;
          }
          setSale(await salesApi.addItem(saleId, product.id, 1));
          setBarcode('');
        } catch (err) {
          setAddError(err instanceof ApiError ? err.message : t('pos.addItemFailed'));
        } finally {
          setIsAddingItem(false);
          window.setTimeout(() => barcodeRef.current?.focus(), 0);
        }
      };

      const queued = scanQueueRef.current.then(operation, operation);
      scanQueueRef.current = queued;
      return queued;
    },
    [sale?.id, t],
  );

  useEffect(() => {
    if (!sale || (sale.status !== 'DRAFT' && sale.status !== 'PAYMENT_PENDING')) return;
    let buffer = '';
    let lastKeyAt = 0;
    let scanStartedAt = 0;
    let editedInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    let editedInputValue = '';

    const restoreEditedInput = () => {
      if (!editedInput) return;
      const prototype = editedInput instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(editedInput, editedInputValue);
      editedInput.dispatchEvent(new Event('input', { bubbles: true }));
      editedInput = null;
    };

    const handleScannerKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target === barcodeRef.current || target?.tagName === 'SELECT' || target?.isContentEditable) return;

      const now = Date.now();
      if (now - lastKeyAt > 100) {
        buffer = '';
        scanStartedAt = now;
        editedInput =
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            ? target
            : null;
        editedInputValue = editedInput?.value ?? '';
      }
      lastKeyAt = now;

      if (event.key === 'Enter') {
        const isFastScan = buffer.length >= 3 && now - scanStartedAt <= buffer.length * 100;
        if (isFastScan) {
          event.preventDefault();
          const scannedBarcode = buffer;
          buffer = '';
          restoreEditedInput();
          setBarcode(scannedBarcode);
          void addBarcodeToSale(scannedBarcode);
        }
        return;
      }
      if (event.key.length === 1) buffer += event.key;
    };

    document.addEventListener('keydown', handleScannerKey, true);
    return () => document.removeEventListener('keydown', handleScannerKey, true);
  }, [addBarcodeToSale, sale]);

  const handleAddByBarcode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!barcode.trim() || !sale) return;
      await addBarcodeToSale(barcode);
    },
    [addBarcodeToSale, barcode, sale],
  );

  const handleAddByProductId = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!productIdInput.trim() || !sale) return;
      const id = Number(productIdInput.trim());
      if (Number.isNaN(id) || id <= 0) {
        setAddError(t('pos.invalidProductId'));
        return;
      }
      setIsAddingItem(true);
      setAddError(null);
      try {
        const updated = await salesApi.addItem(sale.id, id, 1);
        setSale(updated);
        setProductIdInput('');
      } catch (err) {
        setAddError(err instanceof ApiError ? err.message : t('pos.addItemFailed'));
      } finally {
        setIsAddingItem(false);
      }
    },
    [productIdInput, sale, t],
  );

  const handleProductSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!productSearch.trim()) return;
      setIsSearching(true);
      setHasSearched(true);
      setAddError(null);
      try {
        const result = await productsApi.list({ q: productSearch.trim(), isActive: true });
        setSearchResults(result.products);
      } catch (err) {
        setAddError(err instanceof ApiError ? err.message : t('pos.searchFailed'));
      } finally {
        setIsSearching(false);
      }
    },
    [productSearch, t],
  );

  const addSearchResult = useCallback(
    async (product: Product) => {
      if (!sale) return;
      setIsAddingItem(true);
      setAddError(null);
      try {
        setSale(await salesApi.addItem(sale.id, product.id, 1));
        setProductSearch('');
        setSearchResults([]);
        setHasSearched(false);
        barcodeRef.current?.focus();
      } catch (err) {
        setAddError(err instanceof ApiError ? err.message : t('pos.addItemFailed'));
      } finally {
        setIsAddingItem(false);
      }
    },
    [sale, t],
  );

  const changeItemQuantity = useCallback(
    async (item: SaleItem, delta: number) => {
      if (!sale || sale.status === 'COMPLETED' || sale.status === 'VOIDED') return;
      const newQty = item.quantity + delta;
      try {
        const updated = await salesApi.updateItem(sale.id, item.id, newQty);
        setSale(updated);
      } catch (err) {
        setAddError(err instanceof ApiError ? err.message : t('pos.updateItemFailed'));
      }
    },
    [sale, t],
  );

  const handlePayment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sale) return;
      const amount = Number(paymentAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        setPaymentError(t('pos.invalidAmount'));
        return;
      }
      setIsPaying(true);
      setPaymentError(null);
      setDrawerWarning(null);
      setCardUncertain(false);
      try {
        const updated =
          paymentMethod === 'CASH'
            ? await salesApi.recordCashPayment(sale.id, amount)
            : await salesApi.recordCardPayment(sale.id, amount);
        setSale(updated);
        setPaymentAmount('');
        if (paymentMethod === 'CASH' && window.mizanDesktop) {
          try {
            const drawerResult = await window.mizanDesktop.openCashDrawer(sale.id);
            if (!drawerResult.ok) {
              setDrawerWarning(
                drawerResult.error === 'NOT_CONFIGURED'
                  ? t('pos.drawerNotConfigured')
                  : t('pos.drawerOpenFailed'),
              );
            }
          } catch {
            setDrawerWarning(t('pos.drawerOpenFailed'));
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.errorCode === 'CARD_PAYMENT_UNCERTAIN') {
          setCardUncertain(true);
          setPaymentError(t('pos.cardUncertain'));
        } else if (err instanceof ApiError && err.errorCode === 'CARD_DECLINED') {
          setPaymentError(t('pos.cardDeclined'));
        } else {
          setPaymentError(err instanceof ApiError ? err.message : t('pos.paymentFailed'));
        }
      } finally {
        setIsPaying(false);
      }
    },
    [paymentAmount, paymentMethod, sale, t],
  );

  const handleComplete = useCallback(async () => {
    if (!sale) return;
    setIsCompleting(true);
    setCompleteError(null);
    try {
      const completed = await salesApi.complete(sale.id);
      setSale(completed);
      navigate(`/pos/receipt/${completed.id}`);
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : t('pos.completeFailed'));
    } finally {
      setIsCompleting(false);
    }
  }, [navigate, sale, t]);

  const handleVoid = useCallback(async () => {
    if (!sale) return;
    if (!window.confirm(t('pos.confirmVoid'))) return;
    try {
      const voided = await salesApi.void(sale.id);
      setSale(voided);
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : t('pos.voidFailed'));
    }
  }, [sale, t]);

  const handleHold = useCallback(async () => {
    if (!sale) return;
    try {
      await salesApi.hold(sale.id);
      setSale(null);
      setAutoStartSale(false);
      await refreshHeldSales();
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : t('pos.holdFailed'));
    }
  }, [sale, refreshHeldSales, t]);

  const handleResume = useCallback(
    async (saleId: number) => {
      try {
        if (sale && sale.id !== saleId) {
          if (sale.items.length > 0 || sale.total_paid > 0) {
            setLoadError(t('pos.holdCurrentFirst'));
            return;
          }
          await salesApi.void(sale.id);
        }
        const resumed = await salesApi.resume(saleId);
        setSale(resumed);
        setAutoStartSale(true);
        await refreshHeldSales();
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : t('pos.resumeFailed'));
      }
    },
    [sale, refreshHeldSales, t],
  );

  const handleDiscount = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sale) return;
      const value = Number(discountValue);
      const itemId = Number(discountItemId);
      if (!Number.isFinite(value) || value <= 0) {
        setDiscountError(t('pos.discountInvalid'));
        return;
      }
      if (discountScope === 'ITEM' && (!Number.isInteger(itemId) || itemId <= 0)) {
        setDiscountError(t('pos.discountItemRequired'));
        return;
      }
      setIsApplyingDiscount(true);
      setDiscountError(null);
      setDiscountNotice(null);
      try {
        const result = await salesApi.applyDiscount(sale.id, {
          scope: discountScope,
          discount_type: discountType,
          value,
          item_id: discountScope === 'ITEM' ? itemId : undefined,
          reason: discountReason.trim() || undefined,
        });
        if (result.approval_pending) {
          setPendingApproval({ id: result.approval_id, amountContext: result.amount_context });
        } else {
          setSale(result.sale);
          setDiscountValue('');
          setDiscountReason('');
          setDiscountNotice(t('pos.discountApplied'));
        }
      } catch (err) {
        setDiscountError(err instanceof ApiError ? err.message : t('pos.discountFailed'));
      } finally {
        setIsApplyingDiscount(false);
      }
    },
    [discountItemId, discountReason, discountScope, discountType, discountValue, sale, t],
  );

  const handlePromotion = useCallback(async () => {
    if (!sale) return;
    setIsApplyingDiscount(true);
    setDiscountError(null);
    setDiscountNotice(null);
    try {
      const updated = await salesApi.applyBestPromotion(sale.id);
      setSale(updated);
      setDiscountNotice(
        updated.discount_amount > sale.discount_amount
          ? t('pos.promotionApplied')
          : t('pos.noPromotion'),
      );
    } catch (err) {
      setDiscountError(err instanceof ApiError ? err.message : t('pos.promotionFailed'));
    } finally {
      setIsApplyingDiscount(false);
    }
  }, [sale, t]);

  const handleApprovalDecision = useCallback(
    async (decision: 'APPROVE' | 'DENY') => {
      if (!pendingApproval) return;
      setIsDecidingApproval(true);
      setApprovalError(null);
      try {
        const result = await salesApi.decideApproval(pendingApproval.id, {
          manager_username: managerUsername,
          manager_password: managerPassword,
          decision,
          note: approvalNote.trim() || undefined,
        });
        if (result.sale) setSale(result.sale);
        setPendingApproval(null);
        setManagerUsername('');
        setManagerPassword('');
        setApprovalNote('');
        setDiscountValue('');
        setDiscountNotice(
          decision === 'APPROVE' ? t('pos.approvalApproved') : t('pos.approvalDenied'),
        );
      } catch (err) {
        setApprovalError(err instanceof ApiError ? err.message : t('pos.approvalFailed'));
      } finally {
        setIsDecidingApproval(false);
      }
    },
    [approvalNote, managerPassword, managerUsername, pendingApproval, t],
  );

  const canAct = useMemo(() => {
    if (!sale) return false;
    return sale.status === 'DRAFT' || sale.status === 'PAYMENT_PENDING';
  }, [sale]);
  const paymentBlocked = cardUncertain || Boolean(sale?.payment_reconciliation_required);

  if (isLoadingSession) {
    return (
      <PageContainer>
        <Spinner />
      </PageContainer>
    );
  }

  if (!session) {
    return (
      <PageContainer maxWidth={1180}>
        <div className="pos-session-gate">
          <div className="pos-session-gate__icon"><Icon name="register" size={34} /></div>
          <div className="pos-session-gate__eyebrow">{t('pos.title')}</div>
          <h1>{t('pos.noSessionTitle')}</h1>
          <p>{t('pos.noSessionMessage')}</p>
          <div className="pos-session-gate__steps" aria-label={t('pos.beforeSelling')}>
            <span><b>1</b>{t('pos.openShiftStep')}</span>
            <span><b>2</b>{t('pos.enterFloatStep')}</span>
            <span><b>3</b>{t('pos.startSellingStep')}</span>
          </div>
          <Button onClick={() => navigate('/registers')}>{t('pos.openRegister')}</Button>
        </div>
      </PageContainer>
    );
  }

  if (!sale) {
    return (
      <PageContainer>
        {loadError && <AlertBanner tone="danger">{loadError}</AlertBanner>}
        {autoStartSale ? (
          <Spinner />
        ) : (
          <Card>
            <PageHeading>{t('pos.heldSales')}</PageHeading>
            {heldSales.length === 0 ? (
              <EmptyState>{t('pos.noHeldSales')}</EmptyState>
            ) : (
              heldSales.map((held) => (
                <div
                  key={held.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    borderBottom: `1px solid ${theme.color.border}`,
                  }}
                >
                  <span>
                    #{held.id} · {held.items.length} {t('pos.items')}
                  </span>
                  <Button onClick={() => handleResume(held.id)}>{t('pos.resume')}</Button>
                </div>
              ))
            )}
            <Button style={{ marginTop: 16 }} onClick={() => session && startNewSale(session.id)}>
              {t('pos.newSale')}
            </Button>
          </Card>
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth={1180}>
      {loadError && <AlertBanner tone="danger">{loadError}</AlertBanner>}
      <PosHeader session={session} sale={sale} onVoid={handleVoid} onHold={handleHold} />

      <div className="pos-layout">
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 500, marginBottom: 0 }}>
          {canAct && (
            <div className="pos-add-forms" style={{ marginBottom: 16 }}>
              <div className="pos-scanner-status" role="status">
                <span aria-hidden="true">●</span>
                <strong>{t('pos.scannerReady')}</strong>
                <small>{t('pos.scannerHint')}</small>
              </div>
              <form onSubmit={handleAddByBarcode} className="pos-add-form">
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={t('pos.barcodePlaceholder')}
                  style={{ ...inputStyle, flex: 1 }}
                  disabled={isAddingItem}
                />
                <Button type="submit" disabled={isAddingItem || !barcode.trim()}>
                  {t('pos.add')}
                </Button>
              </form>
              <form onSubmit={handleAddByProductId} className="pos-add-form">
                <input
                  type="number"
                  value={productIdInput}
                  onChange={(e) => setProductIdInput(e.target.value)}
                  placeholder={t('pos.productIdPlaceholder')}
                  style={{ ...inputStyle, flex: 1 }}
                  disabled={isAddingItem}
                />
                <Button type="submit" disabled={isAddingItem || !productIdInput.trim()}>
                  {t('pos.add')}
                </Button>
              </form>
              <form onSubmit={handleProductSearch} className="pos-search-form">
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    if (!e.target.value.trim()) setHasSearched(false);
                  }}
                  placeholder={t('pos.productSearchPlaceholder')}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSearching || !productSearch.trim()}
                >
                  {isSearching ? t('pos.searching') : t('pos.search')}
                </Button>
              </form>
              {searchResults.length > 0 && (
                <div className="pos-search-results">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="pos-search-result"
                      onClick={() => addSearchResult(product)}
                    >
                      <span>
                        {product.name} ({product.sku})
                      </span>
                      <span>{formatCurrencyEGP(product.current_price, i18n.language)}</span>
                    </button>
                  ))}
                </div>
              )}
              {hasSearched && !isSearching && searchResults.length === 0 && (
                <div className="pos-search-empty" style={{ flexBasis: '100%' }}>
                  {t('pos.noSearchResults')}
                </div>
              )}
            </div>
          )}

          {addError && <AlertBanner tone="danger">{addError}</AlertBanner>}

          <div style={{ flex: 1 }}>
            {sale.items.length === 0 ? (
              <EmptyState>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('pos.emptyCartTitle')}</div>
                <div>{t('pos.emptyCartMessage')}</div>
              </EmptyState>
            ) : (
              sale.items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  disabled={!canAct}
                  onChangeQty={(delta) => changeItemQuantity(item, delta)}
                />
              ))
            )}
          </div>

          <TotalsPanel sale={sale} />
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 0 }}>
          {heldSales.length === 0 && sale.items.length === 0 && (
            <div className="pos-checkout-empty">
              <span><Icon name="pos" size={28} /></span>
              <strong>{t('pos.checkoutReady')}</strong>
              <small>{t('pos.checkoutReadyMessage')}</small>
            </div>
          )}
          {heldSales.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>
                {t('pos.heldSales')} ({heldSales.length})
              </h2>
              {heldSales.map((held) => (
                <div
                  key={held.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                  }}
                >
                  <span>
                    #{held.id} · {held.items.length} {t('pos.items')}
                  </span>
                  <Button variant="secondary" onClick={() => handleResume(held.id)}>
                    {t('pos.resume')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {sale.status === 'DRAFT' && sale.total_paid === 0 && sale.items.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>
                {t('pos.discounts')}
              </h2>
              <form
                onSubmit={handleDiscount}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select
                    aria-label={t('pos.discountScope')}
                    value={discountScope}
                    onChange={(e) => setDiscountScope(e.target.value as 'ITEM' | 'SALE')}
                    style={inputStyle}
                  >
                    <option value="SALE">{t('pos.wholeSale')}</option>
                    <option value="ITEM">{t('pos.singleItem')}</option>
                  </select>
                  <select
                    aria-label={t('pos.discountType')}
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FIXED')}
                    style={inputStyle}
                  >
                    <option value="PERCENT">{t('pos.percentage')}</option>
                    <option value="FIXED">{t('pos.fixedAmount')}</option>
                  </select>
                </div>
                {discountScope === 'ITEM' && (
                  <select
                    aria-label={t('pos.discountItem')}
                    value={discountItemId}
                    onChange={(e) => setDiscountItemId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">{t('pos.selectItem')}</option>
                    {sale.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.product_name ?? `#${item.product_id}`}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  aria-label={t('pos.discountValue')}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={t('pos.discountValue')}
                  style={inputStyle}
                />
                <input
                  aria-label={t('pos.discountReason')}
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder={t('pos.discountReason')}
                  style={inputStyle}
                />
                {discountError && <AlertBanner tone="danger">{discountError}</AlertBanner>}
                {discountNotice && <AlertBanner tone="success">{discountNotice}</AlertBanner>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="submit" disabled={isApplyingDiscount || !discountValue}>
                    {t('pos.applyDiscount')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isApplyingDiscount}
                    onClick={handlePromotion}
                  >
                    {t('pos.applyPromotion')}
                  </Button>
                </div>
              </form>
            </div>
          )}
          {canAct && sale.remaining_balance > 0 && !paymentBlocked && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>
                {t('pos.payment')}
              </h2>
              <form
                onSubmit={handlePayment}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="button"
                    variant={paymentMethod === 'CASH' ? 'primary' : 'secondary'}
                    onClick={() => setPaymentMethod('CASH')}
                    style={{ flex: 1 }}
                  >
                    {t('pos.cash')}
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'CARD' ? 'primary' : 'secondary'}
                    onClick={() => setPaymentMethod('CARD')}
                    style={{ flex: 1 }}
                  >
                    {t('pos.card')}
                  </Button>
                </div>
                <div>
                  <FieldLabel>{t('pos.amount')}</FieldLabel>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={formatCurrencyEGP(sale.remaining_balance, i18n.language)}
                    style={inputStyle}
                  />
                </div>
                {paymentError && <AlertBanner tone="danger">{paymentError}</AlertBanner>}
                <Button type="submit" disabled={isPaying || !paymentAmount}>
                  {isPaying ? t('pos.processing') : t('pos.recordPayment')}
                </Button>
              </form>
            </>
          )}

          {drawerWarning && <AlertBanner tone="warning">{drawerWarning}</AlertBanner>}

          {paymentBlocked && <AlertBanner tone="danger">{t('pos.cardUncertain')}</AlertBanner>}

          {canAct && sale.total_paid >= sale.total_amount && sale.items.length > 0 && (
            <>
              {completeError && <AlertBanner tone="danger">{completeError}</AlertBanner>}
              <Button variant="primary" onClick={handleComplete} disabled={isCompleting}>
                {isCompleting ? t('pos.completing') : t('pos.completeSale')}
              </Button>
            </>
          )}

          {sale.status === 'COMPLETED' && (
            <Button onClick={() => navigate(`/pos/receipt/${sale.id}`)}>
              {t('pos.viewReceipt')}
            </Button>
          )}
        </Card>
      </div>
      {pendingApproval && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('pos.managerApproval')}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <Card style={{ width: '100%', maxWidth: 440, margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>{t('pos.managerApproval')}</h2>
            <p>{t('pos.approvalContext', { amount: pendingApproval.amountContext })}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                aria-label={t('pos.managerUsername')}
                autoComplete="username"
                autoFocus
                value={managerUsername}
                onChange={(e) => setManagerUsername(e.target.value)}
                placeholder={t('pos.managerUsername')}
                style={inputStyle}
              />
              <input
                aria-label={t('pos.managerPassword')}
                type="password"
                autoComplete="current-password"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
                placeholder={t('pos.managerPassword')}
                style={inputStyle}
              />
              <input
                aria-label={t('pos.approvalNote')}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder={t('pos.approvalNote')}
                style={inputStyle}
              />
              {approvalError && <AlertBanner tone="danger">{approvalError}</AlertBanner>}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPendingApproval(null);
                    setManagerUsername('');
                    setManagerPassword('');
                    setApprovalNote('');
                    setApprovalError(null);
                  }}
                >
                  {t('common.actions.cancel', 'Cancel')}
                </Button>
                <Button
                  variant="danger"
                  disabled={isDecidingApproval || !managerUsername || !managerPassword}
                  onClick={() => handleApprovalDecision('DENY')}
                >
                  {t('pos.deny')}
                </Button>
                <Button
                  disabled={isDecidingApproval || !managerUsername || !managerPassword}
                  onClick={() => handleApprovalDecision('APPROVE')}
                >
                  {isDecidingApproval ? t('pos.processing') : t('pos.approve')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

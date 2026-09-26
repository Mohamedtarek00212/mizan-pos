import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCurrencyEGP, formatDateTime } from '../../i18n/formatters';
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
import { useAuth } from '../../shared/auth/AuthContext';
import { RegisterSession, registersApi } from './registersApi';
import { translateRegisterError } from './registerErrors';

function InfoRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        fontSize: 14,
        gap: theme.spacing(2),
      }}
    >
      <span style={{ color: theme.color.textMuted, flex: '0 0 auto' }}>{label}</span>
      <span style={{ color: theme.color.text, fontWeight: 600, textAlign: 'end', minWidth: 0 }}>
        {value}
      </span>
    </div>
  );
}

type VarianceTone = 'success' | 'danger' | 'neutral';

function varianceTone(variance: number | null): VarianceTone {
  if (variance === null || variance === 0) return 'neutral';
  return variance > 0 ? 'success' : 'danger';
}

function varianceColor(variance: number | null): string {
  const tone = varianceTone(variance);
  if (tone === 'success') return theme.color.success;
  if (tone === 'danger') return theme.color.danger;
  return theme.color.text;
}

/**
 * Register Session screen (Step 3 W-10). Combines "current session
 * status" and "close register" into one screen - minimal clicks for a
 * real cashier ending their shift.
 */
export function RegisterSessionPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const registerId = Number(params.id);

  const [session, setSession] = useState<RegisterSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [countedCash, setCountedCash] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closedResult, setClosedResult] = useState<RegisterSession | null>(null);
  const countedInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const current = await registersApi.getCurrentSession(registerId);
      setSession(current);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setSession(null);
      } else {
        setLoadError(err instanceof ApiError ? err.message : t('registers.failedToLoad'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [registerId, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (session && !closedResult) {
      countedInputRef.current?.focus();
    }
  }, [session, closedResult]);

  const isOwner = session !== null && user !== null && session.cashier_id === user.id;
  const canClose = isOwner || user?.role === 'MANAGER' || user?.role === 'ADMIN';

  const expectedCashPreview = session ? session.expected_cash ?? session.starting_cash : 0;
  const countedAmount = Number(countedCash);
  const hasValidCountedInput =
    countedCash !== '' && !Number.isNaN(countedAmount) && countedAmount >= 0;
  const variancePreview = hasValidCountedInput
    ? Math.round((countedAmount - expectedCashPreview) * 100) / 100
    : null;

  const formattedOpenedAt = useMemo(
    () => (session ? formatDateTime(session.opened_at, i18n.language) : ''),
    [session, i18n.language],
  );

  const varianceDirectionKey =
    variancePreview === null || variancePreview === 0
      ? 'registerSession.variancePreviewBalanced'
      : variancePreview > 0
        ? 'registerSession.variancePreviewSurplus'
        : 'registerSession.variancePreviewShortage';

  function handleRequestClose(): void {
    setInputError(null);
    if (!countedCash) {
      setInputError(t('registerSession.countedCashRequired'));
      return;
    }
    if (Number.isNaN(countedAmount) || countedAmount < 0) {
      setInputError(t('registerSession.countedCashInvalid'));
      return;
    }
    setConfirmStep(true);
  }

  async function handleConfirmClose(): Promise<void> {
    if (!session || isClosing) return;
    setIsClosing(true);
    setCloseError(null);
    try {
      const result = await registersApi.closeSession(registerId, session.id, countedAmount);
      setClosedResult(result);
      setConfirmStep(false);
    } catch (err) {
      setCloseError(translateRegisterError(err, t, 'registerSession.failedToClose'));
      setConfirmStep(false);
      setIsClosing(false);
    }
  }

  if (isLoading) {
    return (
      <PageContainer maxWidth={560}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner /> {t('registers.loading')}
        </Card>
      </PageContainer>
    );
  }

  if (loadError) {
    return (
      <PageContainer maxWidth={560}>
        <PageHeading>{t('registerSession.title')}</PageHeading>
        <AlertBanner tone="danger">{loadError}</AlertBanner>
      </PageContainer>
    );
  }

  if (closedResult) {
    const exceeds = closedResult.exceeds_variance_threshold;
    const finalVariance = closedResult.variance ?? 0;
    return (
      <PageContainer maxWidth={560}>
        <PageHeading>{t('registerSession.closedTitle')}</PageHeading>
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: theme.spacing(2),
            }}
          >
            <span style={{ ...theme.font.subheading }}>
              {closedResult.register_name || closedResult.register_code || `#${closedResult.register_id}`}
            </span>
            <StatusBadge tone="neutral">{t('registers.sessionClosed')}</StatusBadge>
          </div>
          <InfoRow
            label={t('registerSession.startingCashLabel')}
            value={formatCurrencyEGP(closedResult.starting_cash, i18n.language)}
          />
          <InfoRow
            label={t('registerSession.expectedCashLabel')}
            value={formatCurrencyEGP(closedResult.expected_cash ?? 0, i18n.language)}
          />
          <InfoRow
            label={t('registerSession.countedCashLabel')}
            value={formatCurrencyEGP(closedResult.counted_cash ?? 0, i18n.language)}
          />
          <InfoRow
            label={t('registerSession.varianceLabel')}
            value={
              <span
                style={{
                  color: varianceColor(finalVariance),
                  fontWeight: 700,
                  direction: 'ltr',
                  unicodeBidi: 'embed',
                }}
              >
                {formatCurrencyEGP(finalVariance, i18n.language)}
              </span>
            }
          />
          {closedResult.variance_threshold_snapshot !== null && (
            <InfoRow
              label={t('registerSession.thresholdLabel')}
              value={formatCurrencyEGP(closedResult.variance_threshold_snapshot, i18n.language)}
            />
          )}
          {closedResult.closed_by_name && (
            <InfoRow label={t('registerSession.closedByLabel')} value={closedResult.closed_by_name} />
          )}
          {exceeds === true && (
            <AlertBanner tone="warning">
              {t('registerSession.varianceExceedsThresholdWarning')}
            </AlertBanner>
          )}
          {exceeds === false && (
            <AlertBanner tone="success">{t('registerSession.varianceWithinThreshold')}</AlertBanner>
          )}
        </Card>
        <Link to="/registers">
          <Button variant="secondary">{t('registerSession.viewRegisters')}</Button>
        </Link>
      </PageContainer>
    );
  }

  if (!session) {
    return (
      <PageContainer maxWidth={560}>
        <PageHeading>{t('registerSession.title')}</PageHeading>
        <Card>
          <EmptyState>{t('registerSession.noOpenSession')}</EmptyState>
        </Card>
        <Link to="/registers">
          <Button variant="secondary">{t('registers.backToRegisters')}</Button>
        </Link>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth={560}>
      <PageHeading>{t('registerSession.title')}</PageHeading>

      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.spacing(2),
            marginBottom: theme.spacing(2),
          }}
        >
          <div style={{ ...theme.font.subheading, minWidth: 0 }}>
            {session.register_name || session.register_code || `#${session.register_id}`}
          </div>
          <small dir="ltr" style={{ color: theme.color.textMuted }}>{session.register_code}</small>
          <StatusBadge tone="success">{t('registers.sessionOpen')}</StatusBadge>
        </div>
        <InfoRow label={t('registerSession.cashierLabel')} value={session.cashier_name} />
        <InfoRow label={t('registerSession.openedAtLabel')} value={formattedOpenedAt} />
        <InfoRow
          label={t('registerSession.startingCashLabel')}
          value={formatCurrencyEGP(session.starting_cash, i18n.language)}
        />
      </Card>

      {!canClose && <AlertBanner tone="warning">{t('registerSession.notOwnerNotice')}</AlertBanner>}

      {canClose && (
        <Card>
          <div style={{ ...theme.font.subheading, marginBottom: theme.spacing(2) }}>
            {t('registerSession.closeSectionTitle')}
          </div>

          <InfoRow
            label={t('registerSession.expectedCashLabel')}
            value={formatCurrencyEGP(expectedCashPreview, i18n.language)}
          />
          <p style={{ color: theme.color.textMuted, fontSize: 12, margin: '4px 0 16px' }}>
            {t('registerSession.expectedCashPreviewNote')}
          </p>

          <FieldLabel htmlFor="counted-cash">{t('registerSession.countedCashLabel')}</FieldLabel>
          <input
            ref={countedInputRef}
            id="counted-cash"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={countedCash}
            onChange={(e) => {
              setCountedCash(e.target.value);
              setConfirmStep(false);
            }}
            style={inputStyle}
            autoComplete="off"
          />
          <p style={{ color: theme.color.textMuted, fontSize: 13, margin: '6px 0 16px' }}>
            {t('registerSession.countedCashHint')}
          </p>

          {variancePreview !== null && (
            <InfoRow
              label={t('registerSession.variancePreviewLabel')}
              value={
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: varianceColor(variancePreview),
                    fontWeight: 700,
                    direction: 'ltr',
                    unicodeBidi: 'embed',
                  }}
                >
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      background:
                        varianceTone(variancePreview) === 'success'
                          ? theme.color.successSoft
                          : varianceTone(variancePreview) === 'danger'
                            ? theme.color.dangerSoft
                            : theme.color.neutralSoft,
                    }}
                  >
                    {t(varianceDirectionKey)}
                  </span>
                  {formatCurrencyEGP(variancePreview, i18n.language)}
                </span>
              }
            />
          )}

          {inputError && <AlertBanner tone="danger">{inputError}</AlertBanner>}
          {closeError && <AlertBanner tone="danger">{closeError}</AlertBanner>}

          {!confirmStep ? (
            <Button fullWidth onClick={handleRequestClose} style={{ marginTop: theme.spacing(2) }}>
              {t('registerSession.closeButton')}
            </Button>
          ) : (
            <div style={{ marginTop: theme.spacing(2) }}>
              <AlertBanner tone="warning">
                {variancePreview !== null && variancePreview !== 0
                  ? t('registerSession.confirmPromptWithVariance', {
                      direction: t(varianceDirectionKey),
                      amount: formatCurrencyEGP(Math.abs(variancePreview), i18n.language),
                    })
                  : t('registerSession.confirmPrompt')}
              </AlertBanner>
              <div
                style={{
                  display: 'flex',
                  gap: theme.spacing(1),
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  variant="danger"
                  fullWidth
                  disabled={isClosing}
                  onClick={handleConfirmClose}
                  style={{ flex: '1 1 140px' }}
                >
                  {isClosing ? t('registerSession.closingButton') : t('registerSession.confirmYes')}
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={isClosing}
                  onClick={() => setConfirmStep(false)}
                  style={{ flex: '1 1 140px' }}
                >
                  {t('registerSession.confirmCancel')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Button variant="secondary" onClick={() => navigate('/registers')}>
        {t('registers.backToRegisters')}
      </Button>
    </PageContainer>
  );
}

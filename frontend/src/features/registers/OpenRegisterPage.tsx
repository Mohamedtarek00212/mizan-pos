import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../shared/ui/theme';
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
import { ApiError } from '../../shared/api/apiClient';
import { Register, registersApi } from './registersApi';
import { translateRegisterError } from './registerErrors';

/**
 * Open Register screen (Step 3 W-02). Cashier declares the starting cash
 * float; on success, routes straight into the new session view - minimal
 * clicks, per the Phase 3 UX requirements.
 */
export function OpenRegisterPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const registerId = Number(params.id);

  const [register, setRegister] = useState<Register | null>(null);
  const [isLoadingRegister, setIsLoadingRegister] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startingCash, setStartingCash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setIsLoadingRegister(true);
      setLoadError(null);
      try {
        const { registers } = await registersApi.list();
        const match = registers.find((r) => r.id === registerId) ?? null;
        if (!match) {
          setLoadError(t('openRegister.registerInactive'));
        } else {
          setRegister(match);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : t('openRegister.failedToLoad'));
        }
      } finally {
        if (!cancelled) setIsLoadingRegister(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [registerId, t]);

  useEffect(() => {
    if (!isLoadingRegister && register?.is_active) {
      inputRef.current?.focus();
    }
  }, [isLoadingRegister, register]);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (isSubmitting || !register?.is_active) return;
    setError(null);

    if (!startingCash) {
      setError(t('openRegister.startingCashRequired'));
      return;
    }
    const amount = Number(startingCash);
    if (Number.isNaN(amount) || amount < 0) {
      setError(t('openRegister.startingCashInvalid'));
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await registersApi.openSession(registerId, amount);
      navigate(`/registers/${registerId}/session`, {
        state: { justOpened: true, sessionId: session.id },
      });
    } catch (err) {
      setError(translateRegisterError(err, t, 'openRegister.failedToOpen'));
      setIsSubmitting(false);
    }
  }

  if (isLoadingRegister) {
    return (
      <PageContainer maxWidth={480}>
        <PageHeading>{t('openRegister.title')}</PageHeading>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner /> {t('openRegister.loading')}
        </Card>
      </PageContainer>
    );
  }

  if (loadError || !register) {
    return (
      <PageContainer maxWidth={480}>
        <PageHeading>{t('openRegister.title')}</PageHeading>
        <AlertBanner tone="danger">{loadError ?? t('openRegister.failedToLoad')}</AlertBanner>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth={480}>
      <PageHeading>{t('openRegister.title')}</PageHeading>
      <Card>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: theme.spacing(2) }}>
            <FieldLabel>{t('openRegister.registerLabel')}</FieldLabel>
            <div
              style={{
                ...theme.font.subheading,
                color: theme.color.text,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>{register.display_name}</span>
              <small dir="ltr" style={{ color: theme.color.textMuted }}>{register.code}</small>
              {!register.is_active && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: theme.color.dangerSoft,
                    color: theme.color.danger,
                  }}
                >
                  {t('registers.inactiveBadge')}
                </span>
              )}
            </div>
          </div>

          <div style={{ marginBottom: theme.spacing(1) }}>
            <FieldLabel htmlFor="starting-cash">{t('openRegister.startingCashLabel')}</FieldLabel>
            <input
              ref={inputRef}
              id="starting-cash"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={startingCash}
              onChange={(e) => setStartingCash(e.target.value)}
              style={inputStyle}
              autoComplete="off"
              disabled={!register.is_active}
            />
          </div>
          <p
            style={{
              color: theme.color.textMuted,
              fontSize: 13,
              marginTop: 0,
              marginBottom: theme.spacing(3),
            }}
          >
            {t('openRegister.startingCashHint')}
          </p>

          {error && <AlertBanner tone="danger">{error}</AlertBanner>}

          <Button type="submit" fullWidth disabled={isSubmitting || !register.is_active}>
            {isSubmitting ? t('openRegister.openingButton') : t('openRegister.confirmButton')}
          </Button>
        </form>
      </Card>
      <Button variant="secondary" onClick={() => navigate('/registers')}>
        {t('registers.backToRegisters')}
      </Button>
    </PageContainer>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../shared/ui/theme';
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
import { ApiError } from '../../shared/api/apiClient';
import { useAuth } from '../../shared/auth/AuthContext';
import { Register, registersApi } from './registersApi';

/**
 * Registers screen (Step 6 - Register selection). Landing page for the
 * Register & Cash Management workflows: shows every register's live
 * status and routes the Cashier to Open/View based on that status.
 */
export function RegistersPage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [registers, setRegisters] = useState<Register[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await registersApi.list();
      setRegisters(res.registers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('registers.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const isCashier = user?.role === 'CASHIER';

  return (
    <PageContainer maxWidth={720}>
      <PageHeading>{t('registers.title')}</PageHeading>
      <p style={{ color: theme.color.textMuted, marginTop: -12, marginBottom: theme.spacing(3) }}>
        {t('registers.subtitle')}
      </p>

      {isLoading && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner /> {t('registers.loading')}
        </Card>
      )}
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {!isLoading && !error && registers.length === 0 && (
        <Card>
          <EmptyState>{t('registers.empty')}</EmptyState>
        </Card>
      )}

      {!isLoading &&
        !error &&
        registers.map((register) => {
          const isOpen = register.current_session_status === 'OPEN';
          return (
            <Card key={register.id}>
              <div
                className="register-list-item"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: theme.spacing(2),
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div
                    className="register-list-item__code"
                    style={{ ...theme.font.subheading, color: theme.color.text }}
                  >
                    {register.display_name}
                  </div>
                  <div className="register-list-item__code" dir="ltr">{register.code}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge tone={isOpen ? 'success' : 'neutral'}>
                      {isOpen ? t('registers.sessionOpen') : t('registers.sessionClosed')}
                    </StatusBadge>
                    {!register.is_active && (
                      <StatusBadge tone="danger">{t('registers.inactiveBadge')}</StatusBadge>
                    )}
                  </div>
                </div>
                {isOpen ? (
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/registers/${register.id}/session`)}
                  >
                    {t('registers.viewSessionButton')}
                  </Button>
                ) : register.is_active && isCashier ? (
                  <Button onClick={() => navigate(`/registers/${register.id}/open`)}>
                    {t('registers.openButton')}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
    </PageContainer>
  );
}

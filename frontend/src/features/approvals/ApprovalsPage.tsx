import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../shared/api/apiClient';
import {
  AlertBanner,
  Button,
  Card,
  EmptyState,
  PageContainer,
  PageHeading,
  Spinner,
  StatusBadge,
  inputStyle,
} from '../../shared/ui/primitives';
import { theme } from '../../shared/ui/theme';
import { Icon } from '../../shared/ui/Icon';
import { Approval, approvalsApi } from './approvalsApi';

function tone(status: Approval['status']): 'warning' | 'success' | 'danger' {
  if (status === 'APPROVED') return 'success';
  if (status === 'DENIED') return 'danger';
  return 'warning';
}

export function ApprovalsPage(): JSX.Element {
  const { t } = useTranslation();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApprovals((await approvalsApi.list()).approvals);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('approvals.failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approval: Approval, decision: 'APPROVE' | 'DENY'): Promise<void> {
    setDecidingId(approval.id);
    setError(null);
    try {
      const result = await approvalsApi.decide(
        approval.id,
        decision,
        notes[approval.id]?.trim() || undefined,
      );
      setApprovals((current) =>
        current.map((item) => (item.id === approval.id ? result.approval : item)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('approvals.decisionFailed'));
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <PageContainer maxWidth={900}>
      <header className="section-page-header section-page-header--simple"><span className="section-page-header__icon"><Icon name="approval" size={28} /></span><div><PageHeading>{t('approvals.title')}</PageHeading><p>{t('approvals.subtitle')}</p></div></header>
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {loading ? (
        <Spinner />
      ) : approvals.length === 0 ? (
        <EmptyState>{t('approvals.empty')}</EmptyState>
      ) : (
        approvals.map((approval) => (
          <Card key={approval.id} style={{ padding: 18 }}>
            <div
              className="approval-card__heading"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div>
                <strong>
                  #{approval.id} ·{' '}
                  {approval.entity_type === 'DISCOUNT'
                    ? t('approvals.sale')
                    : t('approvals.return')}{' '}
                  #{approval.entity_id}
                </strong>
                <div style={{ color: theme.color.textMuted, marginTop: 5 }}>
                  {t('approvals.requester')} #{approval.requested_by} · {t('approvals.amount')}:{' '}
                  {approval.amount_context ?? '—'}
                </div>
              </div>
              <StatusBadge tone={tone(approval.status)}>{approval.status}</StatusBadge>
            </div>
            {approval.status === 'PENDING' && (
              <div className="approval-card__actions">
                <input
                  aria-label={`${t('approvals.note')} #${approval.id}`}
                  placeholder={t('approvals.note')}
                  value={notes[approval.id] ?? ''}
                  onChange={(e) =>
                    setNotes((current) => ({ ...current, [approval.id]: e.target.value }))
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
                <Button
                  variant="danger"
                  disabled={decidingId === approval.id}
                  onClick={() => decide(approval, 'DENY')}
                >
                  {t('approvals.deny')}
                </Button>
                <Button
                  disabled={decidingId === approval.id}
                  onClick={() => decide(approval, 'APPROVE')}
                >
                  {t('approvals.approve')}
                </Button>
              </div>
            )}
          </Card>
        ))
      )}
    </PageContainer>
  );
}

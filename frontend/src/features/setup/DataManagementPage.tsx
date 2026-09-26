import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertBanner, PageContainer, PageHeading } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';

type Operation = 'backup' | 'restore' | null;

export function DataManagementPage(): JSX.Element {
  const { t } = useTranslation();
  const [operation, setOperation] = useState<Operation>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const available = Boolean(window.mizanDesktop?.data);

  const backup = async (): Promise<void> => {
    if (!window.mizanDesktop?.data) return;
    setOperation('backup');
    setMessage(null);
    try {
      const result = await window.mizanDesktop.data.createBackup();
      if (result.ok) setMessage({ tone: 'success', text: t('dataManagement.backupSuccess', { file: result.fileName }) });
      else if (!result.cancelled) setMessage({ tone: 'danger', text: t(`dataManagement.errors.${result.error ?? 'BACKUP_FAILED'}`) });
    } catch {
      setMessage({ tone: 'danger', text: t('dataManagement.errors.BACKUP_FAILED') });
    } finally {
      setOperation(null);
    }
  };

  const restore = async (): Promise<void> => {
    if (!window.mizanDesktop?.data) return;
    setOperation('restore');
    setMessage(null);
    try {
      const result = await window.mizanDesktop.data.restoreBackup();
      if (result.ok) {
        setMessage({ tone: 'success', text: t('dataManagement.restoreSuccess') });
        window.setTimeout(() => window.location.reload(), 900);
      } else if (!result.cancelled) {
        setMessage({ tone: 'danger', text: t(`dataManagement.errors.${result.error ?? 'RESTORE_FAILED'}`) });
      }
    } catch {
      setMessage({ tone: 'danger', text: t('dataManagement.errors.RESTORE_FAILED') });
    } finally {
      setOperation(null);
    }
  };

  return <PageContainer>
    <PageHeading>{t('dataManagement.title')}</PageHeading>
    <p className="page-subtitle">{t('dataManagement.subtitle')}</p>
    {message && <AlertBanner tone={message.tone}>{message.text}</AlertBanner>}
    {!available && <AlertBanner tone="danger">{t('dataManagement.desktopOnly')}</AlertBanner>}
    <div className="data-management-grid">
      <section className="data-management-card">
        <span className="data-management-card__icon"><Icon name="data" size={30} /></span>
        <h2>{t('dataManagement.backupTitle')}</h2>
        <p>{t('dataManagement.backupHelp')}</p>
        <ul><li>{t('dataManagement.backupPoint1')}</li><li>{t('dataManagement.backupPoint2')}</li></ul>
        <button className="data-management-primary" disabled={!available || operation !== null} onClick={() => void backup()}>
          {operation === 'backup' ? t('dataManagement.working') : t('dataManagement.backupAction')}
        </button>
      </section>
      <section className="data-management-card data-management-card--restore">
        <span className="data-management-card__icon"><Icon name="restore" size={30} /></span>
        <h2>{t('dataManagement.restoreTitle')}</h2>
        <p>{t('dataManagement.restoreHelp')}</p>
        <div className="data-management-warning">{t('dataManagement.restoreWarning')}</div>
        <button disabled={!available || operation !== null} onClick={() => void restore()}>
          {operation === 'restore' ? t('dataManagement.working') : t('dataManagement.restoreAction')}
        </button>
      </section>
    </div>
    <div className="data-management-auto"><strong>{t('dataManagement.autoTitle')}</strong><span>{t('dataManagement.autoHelp')}</span></div>
  </PageContainer>;
}

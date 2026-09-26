import { Component, ErrorInfo, ReactNode } from 'react';
import i18n from '../../i18n/i18n';
import logoMark from '../../assets/brand/mizan-logo-mark.png';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    void window.mizanDesktop?.reportError(
      `${error.name}: ${error.message}\n${info.componentStack ?? ''}`,
    );
  }

  public render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-recovery-page" role="alert">
        <section className="app-recovery-card">
          <img src={logoMark} alt="" />
          <span>{i18n.t('appRecovery.eyebrow')}</span>
          <h1>{i18n.t('appRecovery.title')}</h1>
          <p>{i18n.t('appRecovery.message')}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {i18n.t('appRecovery.reload')}
          </button>
        </section>
      </main>
    );
  }
}

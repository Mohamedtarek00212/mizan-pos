import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { DesktopConnectionGate } from './DesktopConnectionGate';

afterEach(() => {
  delete window.mizanDesktop;
});

describe('DesktopConnectionGate', () => {
  it('does not affect the browser version', () => {
    render(<DesktopConnectionGate><div>Web application</div></DesktopConnectionGate>);
    expect(screen.getByText('Web application')).toBeInTheDocument();
  });

  it('configures and verifies the server before rendering the desktop app', async () => {
    await i18n.changeLanguage('en');
    const saveConfig = vi.fn().mockResolvedValue({
      ok: true,
      apiBaseUrl: 'http://localhost:4000/api',
      status: 200,
    });
    window.mizanDesktop = {
      getAppInfo: vi.fn(),
      window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
      server: {
        getConfig: vi.fn().mockResolvedValue({
          apiBaseUrl: null,
          runtimeMode: 'external',
          runtimeState: 'stopped',
        }),
        testConnection: vi.fn(),
        saveConfig,
        restartLocal: vi.fn(),
      },
      onNavigate: vi.fn(() => vi.fn()),
      session: { read: vi.fn(), write: vi.fn(), clear: vi.fn() },
      reportError: vi.fn(),
      printReceipt: vi.fn(),
      openCashDrawer: vi.fn(),
      data: { createBackup: vi.fn(), restoreBackup: vi.fn() },
    };

    render(<DesktopConnectionGate><div>Desktop application</div></DesktopConnectionGate>);

    const input = await screen.findByLabelText('Mizan server address');
    fireEvent.change(input, { target: { value: 'http://localhost:4000/api' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(saveConfig).toHaveBeenCalledWith('http://localhost:4000/api'));
    expect(await screen.findByText('Desktop application')).toBeInTheDocument();
  });

  it('offers one-click recovery when the local runtime fails', async () => {
    await i18n.changeLanguage('en');
    const restartLocal = vi.fn().mockResolvedValue({
      apiBaseUrl: 'http://127.0.0.1:40123/api',
      runtimeMode: 'standalone',
      runtimeState: 'ready',
    });
    const testConnection = vi.fn().mockResolvedValue({
      ok: true,
      apiBaseUrl: 'http://127.0.0.1:40123/api',
      status: 200,
    });
    window.mizanDesktop = {
      getAppInfo: vi.fn(),
      window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
      server: {
        getConfig: vi.fn().mockResolvedValue({
          apiBaseUrl: null,
          runtimeMode: 'standalone',
          runtimeState: 'failed',
          runtimeErrorCode: 'DATABASE_START_FAILED',
        }),
        testConnection,
        saveConfig: vi.fn(),
        restartLocal,
      },
      onNavigate: vi.fn(() => vi.fn()),
      session: { read: vi.fn(), write: vi.fn(), clear: vi.fn() },
      reportError: vi.fn(),
      printReceipt: vi.fn(),
      openCashDrawer: vi.fn(),
      data: { createBackup: vi.fn(), restoreBackup: vi.fn() },
    };

    render(<DesktopConnectionGate><div>Recovered application</div></DesktopConnectionGate>);
    fireEvent.click(await screen.findByRole('button', { name: 'Restart Mizan services' }));
    await waitFor(() => expect(restartLocal).toHaveBeenCalledOnce());
    expect(await screen.findByText('Recovered application')).toBeInTheDocument();
  });
});

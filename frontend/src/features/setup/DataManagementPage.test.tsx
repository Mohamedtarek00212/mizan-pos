import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { DataManagementPage } from './DataManagementPage';

afterEach(() => { delete window.mizanDesktop; });

describe('DataManagementPage', () => {
  it('creates a backup through the protected desktop bridge', async () => {
    await i18n.changeLanguage('en');
    const createBackup = vi.fn().mockResolvedValue({ ok: true, fileName: 'store.mizan-backup' });
    window.mizanDesktop = { data: { createBackup, restoreBackup: vi.fn() } } as unknown as Window['mizanDesktop'];
    render(<DataManagementPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose location and back up' }));
    await waitFor(() => expect(createBackup).toHaveBeenCalledOnce());
    expect(await screen.findByText(/store\.mizan-backup/)).toBeInTheDocument();
  });
});

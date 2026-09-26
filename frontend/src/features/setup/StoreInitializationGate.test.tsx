import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { setupApi } from './setupApi';
import { StoreInitializationGate } from './StoreInitializationGate';

vi.mock('./setupApi', () => ({
  setupApi: { status: vi.fn(), initialize: vi.fn() },
}));

describe('StoreInitializationGate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('continues normally when the store is already initialized', async () => {
    vi.mocked(setupApi.status).mockResolvedValue({
      initialized: true, store_name: 'Ready Store', currency_code: 'EGP',
    });
    render(<StoreInitializationGate><div>Application ready</div></StoreInitializationGate>);
    expect(await screen.findByText('Application ready')).toBeInTheDocument();
  });

  it('completes the guided four-step setup for a fresh database', async () => {
    vi.mocked(setupApi.status).mockResolvedValue({
      initialized: false, store_name: null, currency_code: null,
    });
    vi.mocked(setupApi.initialize).mockResolvedValue({
      initialized: true, store_name: 'Green Market', currency_code: 'EGP',
    });
    render(<StoreInitializationGate><div>Application ready</div></StoreInitializationGate>);

    fireEvent.change(await screen.findByLabelText('Store name'), { target: { value: 'Green Market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Administrator full name'), { target: { value: 'Store Owner' } });
    fireEvent.change(screen.getByLabelText('Sign-in username'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'StrongPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Register name'), { target: { value: 'Main register' } });
    fireEvent.change(screen.getByLabelText('Default tax rate (%)'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create store and continue' }));

    await waitFor(() => expect(setupApi.initialize).toHaveBeenCalledWith(expect.objectContaining({
      store_name: 'Green Market', admin_username: 'owner', register_name: 'Main register', register_code: 'REG-1', tax_rate_pct: 14,
    })));
    expect(await screen.findByText('Application ready')).toBeInTheDocument();
  });
});

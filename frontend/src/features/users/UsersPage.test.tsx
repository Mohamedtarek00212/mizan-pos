import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { UsersPage } from './UsersPage';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', fullName: 'Administrator', role: 'ADMIN' },
  }),
}));

vi.mock('./usersApi', () => ({
  usersApi: {
    list: (...args: unknown[]) => mocks.list(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
}));

describe('UsersPage password reset', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mocks.list.mockReset();
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.list.mockResolvedValue({
      users: [{
        id: 7,
        username: 'cashier',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        is_active: true,
        created_at: '2026-09-17T12:00:00Z',
        deactivated_at: null,
      }],
    });
    mocks.update.mockResolvedValue({});
  });

  it('lets an administrator securely set a new password for a cashier', async () => {
    render(<UsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set new password' }));
    expect(screen.getByRole('dialog', { name: 'Set a new password for Test Cashier' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Cashier2026!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Cashier2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(7, { password: 'Cashier2026!' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('A new password was set for Test Cashier successfully.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not submit when confirmation does not match', async () => {
    render(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set new password' }));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Cashier2026!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Different2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

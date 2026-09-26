import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { RegistersPage } from './RegistersPage';

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'cashier1', fullName: 'Cash Ier', role: 'CASHIER' } }),
}));

vi.mock('./registersApi', () => ({
  registersApi: {
    list: vi.fn().mockResolvedValue({
      registers: [
        { id: 1, code: 'REG-1', display_name: 'Main register', is_active: true, current_session_status: 'CLOSED' },
        { id: 2, code: 'REG-2', display_name: 'Second register', is_active: true, current_session_status: 'OPEN' },
      ],
    }),
  },
}));

describe('RegistersPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows Open/View actions based on each register status (English)', async () => {
    render(
      <MemoryRouter>
        <RegistersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Registers' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('REG-1')).toBeInTheDocument();
    });
    expect(screen.getByText('REG-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Register' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Session' })).toBeInTheDocument();
  });

  it('renders correctly in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(
      <MemoryRouter>
        <RegistersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'الخزائن' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('REG-1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'فتح الخزينة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عرض الجلسة' })).toBeInTheDocument();
  });
});

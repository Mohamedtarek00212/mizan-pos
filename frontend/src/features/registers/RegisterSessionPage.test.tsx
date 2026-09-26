import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { ApiError } from '../../shared/api/apiClient';
import { RegisterSessionPage } from './RegisterSessionPage';

const getCurrentSessionMock = vi.fn();
const closeSessionMock = vi.fn();
let mockUser = { id: 1, username: 'cashier1', fullName: 'Cash Ier', role: 'CASHIER' };

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('./registersApi', () => ({
  registersApi: {
    getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
    closeSession: (...args: unknown[]) => closeSessionMock(...args),
  },
}));

const OPEN_SESSION = {
  id: 99,
  register_id: 1,
  register_code: 'REG-1',
  register_name: 'Main register',
  cashier_id: 1,
  cashier_name: 'Cash Ier',
  status: 'OPEN' as const,
  starting_cash: 100,
  expected_cash: null,
  counted_cash: null,
  variance: null,
  variance_threshold_snapshot: null,
  exceeds_variance_threshold: null,
  opened_at: '2026-01-01T08:00:00.000Z',
  closed_at: null,
  closed_by: null,
  closed_by_name: null,
};

function renderAtRegisterOne() {
  return render(
    <MemoryRouter initialEntries={['/registers/1/session']}>
      <Routes>
        <Route path="/registers/:id/session" element={<RegisterSessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RegisterSessionPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockUser = { id: 1, username: 'cashier1', fullName: 'Cash Ier', role: 'CASHIER' };
    getCurrentSessionMock.mockReset();
    closeSessionMock.mockReset();
  });

  it("shows the owner's close form with a live variance preview", async () => {
    getCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    renderAtRegisterOne();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Register Session' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Close Register' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Counted cash'), { target: { value: '120' } });
    expect(screen.getByText('Variance (preview)')).toBeInTheDocument();
  });

  it('requires a confirmation step before closing, then closes on confirm', async () => {
    getCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    closeSessionMock.mockResolvedValue({
      ...OPEN_SESSION,
      status: 'CLOSED',
      expected_cash: 100,
      counted_cash: 100,
      variance: 0,
      variance_threshold_snapshot: 50,
      exceeds_variance_threshold: false,
    });
    renderAtRegisterOne();

    await waitFor(() => screen.getByLabelText('Counted cash'));
    fireEvent.change(screen.getByLabelText('Counted cash'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close Register' }));

    expect(
      await screen.findByText(
        'Close this register with the counted cash above? This cannot be undone.',
      ),
    ).toBeInTheDocument();
    expect(closeSessionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, close it' }));

    await waitFor(() => {
      expect(closeSessionMock).toHaveBeenCalledWith(1, 99, 100);
    });
    expect(await screen.findByRole('heading', { name: 'Session Closed' })).toBeInTheDocument();
    expect(screen.getByText('Variance is within the configured threshold.')).toBeInTheDocument();
  });

  it('shows a warning banner when the closed variance exceeds the threshold', async () => {
    getCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    closeSessionMock.mockResolvedValue({
      ...OPEN_SESSION,
      status: 'CLOSED',
      expected_cash: 100,
      counted_cash: 300,
      variance: 200,
      variance_threshold_snapshot: 50,
      exceeds_variance_threshold: true,
    });
    renderAtRegisterOne();

    await waitFor(() => screen.getByLabelText('Counted cash'));
    fireEvent.change(screen.getByLabelText('Counted cash'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close Register' }));

    expect(
      await screen.findByText(
        'Close this register with a Surplus of EGP 200.00? This cannot be undone.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Yes, close it' }));

    expect(
      await screen.findByText(
        'This variance exceeds the configured threshold and has been flagged for Manager review.',
      ),
    ).toBeInTheDocument();
  });

  it("prevents a non-owner Cashier from closing another cashier's session", async () => {
    mockUser = { id: 2, username: 'cashier2', fullName: 'Other Cashier', role: 'CASHIER' };
    getCurrentSessionMock.mockResolvedValue(OPEN_SESSION);
    renderAtRegisterOne();

    await waitFor(() => {
      expect(
        screen.getByText(
          'This session belongs to another cashier. Only the owning cashier or a Manager/Admin can close it.',
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Counted cash')).not.toBeInTheDocument();
  });

  it('shows an empty state when the register has no open session', async () => {
    getCurrentSessionMock.mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'This register has no open session'),
    );
    renderAtRegisterOne();

    await waitFor(() => {
      expect(screen.getByText('This register has no open session.')).toBeInTheDocument();
    });
  });
});
